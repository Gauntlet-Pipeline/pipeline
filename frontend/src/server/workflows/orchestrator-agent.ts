import { streamObject, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages } from "ai";
import type { UIMessage, FileUIPart } from "ai";
import { z } from "zod";
import { db } from "@/server/db";
import {
  conversationMessages,
  videoSessions,
} from "@/server/db/video-generation/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { FactExtractionAgent } from "./agents/fact-extraction-agent";
import { ScriptGenerationAgent } from "./agents/script-generation-agent";
import { ImageSelectionAgent } from "./agents/image-selection-agent";
import type { WorkflowContext, WorkflowStep } from "@/types/workflow";
import { extractTextFromPDF } from "@/server/utils/extractPDF";
import { extractTextFromURL, detectURLs } from "@/server/utils/extractURL";
import type { OrchestratorResponse } from "./schemas/orchestrator-response-schema";
import { OrchestratorResponseSchema } from "./schemas/orchestrator-response-schema";

export class OrchestratorAgent {
  private factAgent = new FactExtractionAgent();
  private scriptAgent = new ScriptGenerationAgent();
  private imageAgent = new ImageSelectionAgent();

  /**
   * Define tools that the orchestrator can call
   * Note: execute functions are bound to this class instance
   */
  private getTools(sessionId: string, userId: string, messages: UIMessage[]) {
    // Define schemas explicitly to ensure proper JSON Schema conversion
    const extractFactsSchema = z.object({
      userMessage: z.string().describe("Original user message for context"),
      topic: z.string().optional().describe("Detected or provided topic"),
    });

    const generateScriptSchema = z.object({
      confirmedFacts: z
        .array(
          z.object({
            concept: z.string(),
            details: z.string(),
          }),
        )
        .describe("Confirmed facts from fact extraction step"),
      topic: z.string().optional().describe("Topic for the video"),
      learningObjective: z.string().optional().describe("Learning objective"),
    });

    const selectImagesSchema = z.object({
      script: z
        .unknown()
        .describe("The generated script to base image search on"),
      searchQueries: z
        .array(z.string())
        .optional()
        .describe("Optional specific search queries for images"),
    });

    return {
      extract_facts: tool({
        description:
          "Extract educational facts from learning materials (PDF, URL, or text). Returns facts pending user review.",
        inputSchema: extractFactsSchema,
        execute: async (args: z.infer<typeof extractFactsSchema>) => {
          console.log("[Orchestrator] extract_facts tool called", {
            userMessageLength: args.userMessage.length,
            hasTopic: !!args.topic,
          });

          // Lazy extraction: Extract PDF/URL content only when this tool is called
          console.log("[Orchestrator] Starting content extraction");
          const extractedContent = await this.extractContent(
            messages,
            args.userMessage,
          );
          console.log("[Orchestrator] Content extraction completed", {
            extractedLength: extractedContent.length,
          });

          // Combine extracted content with user message
          const materials = extractedContent
            ? `${args.userMessage}\n\n--- Learning Materials ---\n${extractedContent}`
            : args.userMessage;

          console.log("[Orchestrator] Calling factAgent.process");
          const result = await this.factAgent.process({
            userMessage: materials,
            conversationHistory: [],
            sessionId,
            userId,
            context: { step: "fact_extraction", topic: args.topic },
          });

          console.log("[Orchestrator] factAgent.process completed", {
            success: result.success,
            hasData: !!result.data,
            hasConversationResponse: !!result.conversationResponse,
            conversationResponseLength:
              result.conversationResponse?.length ?? 0,
            factsCount: result.data?.facts?.length ?? 0,
          });

          if (!result.success || !result.data) {
            console.error("[Orchestrator] Fact extraction failed", {
              error: result.error,
            });
            throw new Error(result.error ?? "Failed to extract facts");
          }

          // Format response according to OrchestratorResponseSchema
          const toolResponse = {
            message: result.conversationResponse,
            data: {
              facts: result.data.facts ?? [],
              topic: result.data.topic ?? args.topic,
              learningObjective: result.data.learningObjective,
            },
            document: {
              type: "facts",
              facts: result.data.facts ?? [],
              topic: result.data.topic ?? args.topic,
              learningObjective: result.data.learningObjective,
              editable: true,
            },
            nextStep: "fact_extraction" as const,
          };

          console.log("[Orchestrator] extract_facts tool returning", {
            messageLength: toolResponse.message?.length ?? 0,
            factsCount: toolResponse.data.facts.length,
            hasDocument: !!toolResponse.document,
          });

          return toolResponse;
        },
      }),

      generate_script: tool({
        description:
          "Generate educational video script from confirmed facts. Script is editable by user after generation.",
        inputSchema: generateScriptSchema,
        execute: async (args: z.infer<typeof generateScriptSchema>) => {
          const result = await this.scriptAgent.process({
            userMessage: `Generate script for topic: ${args.topic ?? "educational content"}`,
            conversationHistory: [],
            sessionId,
            userId,
            context: {
              step: "script_generation",
              confirmedFacts: args.confirmedFacts,
              topic: args.topic,
              learningObjective: args.learningObjective,
            },
          });

          if (!result.success || !result.data) {
            throw new Error(result.error ?? "Failed to generate script");
          }

          // Format response according to OrchestratorResponseSchema
          return {
            message: result.conversationResponse,
            data: {
              script: result.data,
            },
            document: {
              type: "script",
              script: result.data,
              editable: true,
            },
            nextStep: "script_generation" as const,
          };
        },
      }),

      select_images: tool({
        description:
          "Fetch top 6 images from Google Programmable Search Engine based on script content. User will select 1-2 images.",
        inputSchema: selectImagesSchema,
        execute: async (args: z.infer<typeof selectImagesSchema>) => {
          const result = await this.imageAgent.process({
            userMessage: "Fetch images for this script",
            conversationHistory: [],
            sessionId,
            userId,
            context: {
              step: "image_selection",
              generatedScript: args.script,
            },
          });

          if (!result.success || !result.data) {
            throw new Error(result.error ?? "Failed to fetch images");
          }

          const images =
            (result.data as { availableImages?: unknown }).availableImages ??
            [];

          // Format response according to OrchestratorResponseSchema
          return {
            message: result.conversationResponse,
            data: {
              images,
            },
            document: {
              type: "images",
              images,
              selectable: true,
            },
            nextStep: "image_selection" as const,
          };
        },
      }),
    };
  }

  /**
   * Process a user message through the orchestrator
   * Returns a streamable value that streams both chat messages and structured documents
   */
  async process(
    sessionId: string,
    userId: string,
    userMessage: string,
    messages: UIMessage[],
  ) {
    // 1. Load current session state
    const session = await this.loadSession(sessionId);

    // 2. Check if files are attached in the last user message
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const hasFiles =
      lastUserMessage?.parts?.some(
        (p: { type: string }) => p.type === "file",
      ) ?? false;
    const fileCount =
      lastUserMessage?.parts?.filter((p: { type: string }) => p.type === "file")
        .length ?? 0;

    console.log("[Orchestrator] File detection", {
      hasFiles,
      fileCount,
      lastMessagePartsCount: lastUserMessage?.parts?.length ?? 0,
    });

    // 2a. If files are attached, BYPASS the AI and extract facts directly
    // Don't use AI at all - just call the fact extraction agent
    if (hasFiles && fileCount > 0) {
      console.log(
        "[Orchestrator] Files detected - bypassing AI, calling fact agent directly",
      );

      // Extract content from files
      const extractedContent = await this.extractContent(messages, userMessage);
      console.log("[Orchestrator] Content extracted", {
        contentLength: extractedContent.length,
      });

      // Call fact extraction agent directly
      const materials = extractedContent
        ? `${userMessage}\n\n--- Learning Materials ---\n${extractedContent}`
        : userMessage;

      const factResult = await this.factAgent.process({
        userMessage: materials,
        conversationHistory: [],
        sessionId,
        userId,
        context: { step: "fact_extraction", topic: undefined },
      });

      console.log("[Orchestrator] Fact extraction completed", {
        success: factResult.success,
        factsCount: factResult.data?.facts?.length ?? 0,
      });

      // Return a simple non-streaming response
      // Create a synchronous stream that emits the complete result immediately
      const message =
        factResult.conversationResponse ||
        "I've extracted facts from your materials. Please review them.";
      const data = factResult.data || {};
      const document = {
        type: "fact_extraction_result",
        ...factResult.data,
        editable: true,
      };

      // Create a stream that immediately emits the complete result
      const immediateStream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "object",
            object: { message, data, document },
            properties: { message, data, document },
          });
          controller.close();
        },
      });

      return {
        result: { partialObjectStream: immediateStream },
        sessionId,
      };
    }

    // 3. Build system prompt with context (only for non-file messages)
    const systemPrompt = this.buildSystemPrompt(session, hasFiles, fileCount);

    // 4. Get tools with proper session context (messages passed for lazy extraction)
    const tools = this.getTools(sessionId, userId, messages);

    // 5. Handle fact confirmation: if user confirms facts, move from extracted_facts to confirmed_facts
    // This needs to happen before streaming so the tools have the right context
    if (session?.extractedFacts && Array.isArray(session.extractedFacts)) {
      const confirmationPatterns = [
        /ready to proceed/i,
        /these facts look good/i,
        /let's proceed/i,
        /continue/i,
        /confirm/i,
        /approve/i,
        /proceed with script/i,
        /proceed to script/i,
        /yes/i,
        /looks good/i,
      ];

      if (confirmationPatterns.some((p) => p.test(userMessage))) {
        // Move extractedFacts to confirmedFacts and advance step
        await db
          .update(videoSessions)
          .set({
            confirmedFacts: session.extractedFacts,
            extractedFacts: null, // Clear extracted facts
            currentStep: "script_generation",
            updatedAt: new Date(),
          })
          .where(eq(videoSessions.id, sessionId));
      }
    }

    // 6. Use streamObject to stream both message and document
    // This streams the structured output in real-time, allowing both
    // the chat message and document to update as they're generated
    // Content extraction happens inside the extract_facts tool when it's called
    // Note: Using type assertion for tools parameter as TypeScript types may not be fully updated
    console.log("[Orchestrator] Starting streamObject", {
      sessionId,
      userMessageLength: userMessage.length,
      messagesCount: messages.length,
      hasTools: !!tools && Object.keys(tools).length > 0,
    });

    const result = streamObject({
      model: openai("gpt-4o-mini"),
      schema: OrchestratorResponseSchema,
      system: systemPrompt,
      ...({ tools } as { tools: typeof tools }),
      messages: [
        ...convertToModelMessages(messages),
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    // IMPORTANT: Do NOT access result.partialObjectStream or result.textStream here
    // Accessing these getters locks the stream. We must return the result object
    // and let the route handler access partialObjectStream only once, then immediately tee it.
    console.log(
      "[Orchestrator] streamObject called, returning result object (not accessing streams)",
    );

    // 6. Return the stream result object (contains both partialObjectStream and textStream)
    // The route handler will handle streaming to the frontend and saving to database
    // We return the full result so the route can access both streams
    // CRITICAL: Don't access result.partialObjectStream or result.textStream here as it locks the stream
    return { result, sessionId };
  }

  /**
   * Extract PDF and URL content from messages
   */
  private async extractContent(
    messages: UIMessage[],
    userMessage: string,
  ): Promise<string> {
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const extractedContent: string[] = [];

    // Extract PDF content
    if (lastUserMessage?.parts) {
      const fileParts = lastUserMessage.parts.filter(
        (part: { type: string }): part is FileUIPart => part.type === "file",
      );

      for (const filePart of fileParts) {
        if (
          filePart.mediaType === "application/pdf" ||
          filePart.filename?.toLowerCase().endsWith(".pdf")
        ) {
          try {
            let pdfBuffer: ArrayBuffer | Buffer;

            if (filePart.url?.startsWith("data:")) {
              const base64Data = filePart.url.split(",")[1];
              if (base64Data) {
                pdfBuffer = Buffer.from(base64Data, "base64");
              } else {
                continue;
              }
            } else if (filePart.url) {
              const response = await fetch(filePart.url, {
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) {
                continue;
              }
              pdfBuffer = await response.arrayBuffer();
            } else {
              continue;
            }

            const pdfText = await extractTextFromPDF(pdfBuffer);
            if (pdfText && pdfText.trim().length > 0) {
              extractedContent.push(
                `--- PDF Content (${filePart.filename ?? "file"}): ---\n${pdfText}`,
              );
            }
          } catch (error) {
            console.error("Error extracting PDF content:", error);
          }
        }
      }
    }

    // Extract URL content
    const detectedURLs = detectURLs(userMessage);
    for (const url of detectedURLs) {
      try {
        const urlText = await extractTextFromURL(url);
        if (urlText && urlText.trim().length > 0) {
          extractedContent.push(`--- URL Content (${url}): ---\n${urlText}`);
        }
      } catch (error) {
        console.error(`Error extracting URL content from ${url}:`, error);
      }
    }

    return extractedContent.join("\n\n");
  }

  /**
   * Load session from database
   */
  private async loadSession(sessionId: string) {
    const session = await db.query.videoSessions.findFirst({
      where: eq(videoSessions.id, sessionId),
    });

    return session;
  }

  /**
   * Build system prompt with current context
   */
  private buildSystemPrompt(
    session: typeof videoSessions.$inferSelect | undefined,
    hasFiles: boolean,
    fileCount: number,
  ): string {
    const currentStep =
      (session?.currentStep as WorkflowStep | undefined) ?? "fact_extraction";
    const workflowContext = (session?.workflowContext as
      | WorkflowContext
      | undefined) ?? {
      step: currentStep,
    };

    const fileInfo = hasFiles
      ? `\n\n**IMPORTANT: The teacher has attached ${fileCount} file(s) (PDF or other learning materials).
You MUST call the extract_facts tool to extract educational content from these files.**`
      : "";

    return `You are an intelligent orchestrator helping a teacher create educational videos.

Your job is to:
1. Understand what the teacher needs from their message
2. Call the appropriate tool(s) to get the work done
3. Return a unified response with:
   - message: A conversational response to the teacher (displayed ONLY in chat panel)
   - data: The structured data from the tool for database storage (NOT displayed in UI)
   - document: The document to display in the main panel (editable structure, displayed ONLY in main panel)
   - nextStep: The next workflow step (if applicable)

Available tools:
- extract_facts: Extract educational facts from learning materials (PDF, URL, or text)
  Use when: Teacher provides learning materials via FILES (PDF uploads), URLs, or pasted text content
  **ALWAYS call this tool when files are attached or URLs are detected**
  Returns: Extracted facts (pending review)
  
- generate_script: Generate educational video script from confirmed facts
  Use when: Teacher confirms facts are ready (explicit confirmation or implicit from context)
  Requires: confirmed_facts must exist in session
  Returns: Generated script (editable by user)
  
- select_images: Fetch and select images for the video script
  Use when: Script is ready and teacher wants to select images
  Requires: generated_script must exist in session
  Returns: Top 6 images from Google Programmable Search Engine for user selection

Current workflow step: ${currentStep}
Current context: ${JSON.stringify(workflowContext, null, 2)}
Session has extracted_facts: ${session?.extractedFacts ? "yes" : "no"}
Session has confirmed_facts: ${session?.confirmedFacts ? "yes" : "no"}
Session has generated_script: ${session?.generatedScript ? "yes" : "no"}${fileInfo}

Be conversational and helpful. Guide the teacher through the workflow naturally.
When files are attached, immediately call extract_facts to process them.
When returning the response, ensure:
- message is pure conversational text (no JSON, no structured data)
- document contains the UI-ready structure for the main panel
- data contains the raw structured data for database storage`;
  }

  /**
   * Save structured data to database based on tool result
   */
  async saveStructuredData(
    sessionId: string,
    data: unknown,
    _response: OrchestratorResponse,
  ): Promise<void> {
    if (!data) return;

    // Determine what type of data we have based on the structure
    const dataObj = data as Record<string, unknown>;

    // If it's facts data, save to extracted_facts column (not confirmed_facts)
    if (dataObj.facts && Array.isArray(dataObj.facts)) {
      await db
        .update(videoSessions)
        .set({
          extractedFacts: dataObj.facts, // Save to extracted_facts (pending review)
          topic: (dataObj.topic as string) || undefined,
          learningObjective: (dataObj.learningObjective as string) || undefined,
          currentStep: "fact_extraction",
          updatedAt: new Date(),
        })
        .where(eq(videoSessions.id, sessionId));
    }

    // If it's script data, save to generated_script
    if (dataObj.script || dataObj.segments) {
      await db
        .update(videoSessions)
        .set({
          generatedScript: dataObj.script ?? dataObj,
          currentStep: "script_generation",
          updatedAt: new Date(),
        })
        .where(eq(videoSessions.id, sessionId));
    }

    // If it's images data, they will be saved when user selects them
    // (handled separately in image selection flow)
  }

  /**
   * Save conversation message to database
   */
  async saveConversationMessage(
    sessionId: string,
    message: string,
  ): Promise<void> {
    const insertData = {
      id: nanoid(),
      sessionId,
      role: "assistant" as const,
      content: message,
      parts: null,
      metadata: null,
      createdAt: new Date(),
    };
    await db.insert(conversationMessages).values(insertData);
  }

  /**
   * Format tool result as document for main panel
   */
  private formatDocumentForMainPanel(
    toolResult: unknown,
    _nextStep?: WorkflowStep,
  ): unknown {
    if (!toolResult) return undefined;

    const result = toolResult as Record<string, unknown>;

    // Format facts for main panel
    if (result.facts && Array.isArray(result.facts)) {
      return {
        type: "facts",
        facts: result.facts,
        topic: result.topic,
        learningObjective: result.learningObjective,
        editable: true,
      };
    }

    // Format script for main panel
    if (result.script || result.segments) {
      return {
        type: "script",
        script: result.script ?? result,
        editable: true,
      };
    }

    // Format images for main panel
    if (result.images && Array.isArray(result.images)) {
      return {
        type: "images",
        images: result.images,
        selectable: true,
      };
    }

    return undefined;
  }

  /**
   * Load conversation history from database
   */
  async loadConversationHistory(sessionId: string): Promise<UIMessage[]> {
    type ConversationMessage = typeof conversationMessages.$inferSelect;

    const dbMessages: ConversationMessage[] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(conversationMessages.createdAt);

    return dbMessages.map((msg): UIMessage => {
      const role = msg.role as "user" | "assistant" | "system";
      const parts = msg.parts
        ? (msg.parts as UIMessage["parts"])
        : [{ type: "text" as const, text: msg.content }];
      const metadata = msg.metadata
        ? (msg.metadata as Record<string, unknown>)
        : undefined;

      return {
        id: msg.id,
        role,
        parts,
        metadata,
      };
    });
  }
}
