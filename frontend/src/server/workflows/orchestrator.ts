import type { UIMessage, FileUIPart } from "ai";
import { convertToCoreMessages } from "ai";
import { FactExtractionAgent } from "./agents/fact-extraction-agent";
import { ScriptGenerationAgent } from "./agents/script-generation-agent";
import { ImageSelectionAgent } from "./agents/image-selection-agent";
import type { WorkflowContext, WorkflowStep } from "@/types/workflow";
import { db } from "@/server/db";
import {
  conversationMessages,
  videoSessions,
  videoAssets,
} from "@/server/db/video-generation/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { BaseAgent } from "./agents/base-agent";
import { extractTextFromPDF } from "@/server/utils/extractPDF";
import { extractTextFromURL, detectURLs } from "@/server/utils/extractURL";

export class WorkflowOrchestrator {
  private agents = new Map<WorkflowStep, BaseAgent>([
    ["fact_extraction", new FactExtractionAgent()],
    ["script_generation", new ScriptGenerationAgent()],
    ["image_selection", new ImageSelectionAgent()],
  ]);

  /**
   * Process a user message through the workflow
   */
  async processMessage(
    sessionId: string,
    userId: string,
    userMessage: string,
    messages: UIMessage[],
  ): Promise<{
    response: string;
    structuredData?: unknown;
    nextStep?: WorkflowStep;
    updatedContext?: WorkflowContext;
  }> {
    // Load or create workflow context
    const context = await this.loadOrCreateContext(sessionId, userId, messages);

    // Extract PDF and URL content before passing to agent
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    let enhancedUserMessage = userMessage;
    const extractedContent: string[] = [];

    console.log("Orchestrator: Processing message", {
      sessionId,
      hasUserMessage: !!userMessage,
      userMessageLength: userMessage.length,
      hasLastUserMessage: !!lastUserMessage,
      hasFileParts: !!lastUserMessage?.parts?.some((p) => p.type === "file"),
    });

    // Extract PDF content from file attachments
    if (lastUserMessage?.parts) {
      const fileParts = lastUserMessage.parts.filter(
        (part: { type: string }): part is FileUIPart => part.type === "file",
      );

      console.log("Orchestrator: Found file parts", {
        count: fileParts.length,
        files: fileParts.map((f) => ({
          filename: f.filename,
          mediaType: f.mediaType,
          hasUrl: !!f.url,
          urlType: f.url?.substring(0, 20),
        })),
      });

      for (const filePart of fileParts) {
        // Check if it's a PDF
        if (
          filePart.mediaType === "application/pdf" ||
          filePart.filename?.toLowerCase().endsWith(".pdf")
        ) {
          try {
            console.log("Orchestrator: Extracting PDF", {
              filename: filePart.filename,
              urlType: filePart.url?.substring(0, 30),
            });

            let pdfBuffer: ArrayBuffer | Buffer;

            if (filePart.url?.startsWith("data:")) {
              // Data URL (base64 encoded)
              const base64Data = filePart.url.split(",")[1];
              if (base64Data) {
                pdfBuffer = Buffer.from(base64Data, "base64");
                console.log("Orchestrator: Decoded PDF from data URL", {
                  bufferSize:
                    pdfBuffer instanceof Buffer
                      ? pdfBuffer.length
                      : pdfBuffer.byteLength,
                });
              } else {
                console.warn("PDF data URL missing base64 data");
                continue;
              }
            } else if (filePart.url) {
              // Regular URL - fetch it
              console.log("Orchestrator: Fetching PDF from URL", {
                url: filePart.url.substring(0, 50),
              });
              const response = await fetch(filePart.url, {
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) {
                console.warn(
                  `Failed to fetch PDF from URL: ${response.statusText}`,
                );
                continue;
              }
              pdfBuffer = await response.arrayBuffer();
              console.log("Orchestrator: Fetched PDF from URL", {
                bufferSize: pdfBuffer.byteLength,
              });
            } else {
              console.warn("PDF file part missing URL");
              continue;
            }

            const pdfText = await extractTextFromPDF(pdfBuffer);
            console.log("Orchestrator: Extracted PDF text", {
              textLength: pdfText.length,
              preview: pdfText.substring(0, 100),
            });
            if (pdfText && pdfText.trim().length > 0) {
              extractedContent.push(
                `--- PDF Content (${filePart.filename ?? "file"}): ---\n${pdfText}`,
              );
            } else {
              console.warn("Orchestrator: PDF extraction returned empty text");
            }
          } catch (error) {
            console.error("Error extracting PDF content:", error);
            console.error("PDF extraction error details:", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              filename: filePart.filename,
            });
            // Continue with other files/URLs even if one fails
          }
        }
      }
    }

    // Extract URL content from user message text
    const detectedURLs = detectURLs(userMessage);
    if (detectedURLs.length > 0) {
      console.log("Orchestrator: Detected URLs", { urls: detectedURLs });
    }
    for (const url of detectedURLs) {
      try {
        const urlText = await extractTextFromURL(url);
        if (urlText && urlText.trim().length > 0) {
          extractedContent.push(`--- URL Content (${url}): ---\n${urlText}`);
        }
      } catch (error) {
        console.error(`Error extracting URL content from ${url}:`, error);
        // Continue with other URLs even if one fails
      }
    }

    // Combine user message with extracted content
    if (extractedContent.length > 0) {
      console.log("Orchestrator: Combining extracted content", {
        extractedCount: extractedContent.length,
        totalLength: extractedContent.join("\n").length,
      });
      enhancedUserMessage = [
        userMessage ||
          "Please extract facts from the provided learning materials.",
        "",
        "--- Extracted Learning Materials ---",
        ...extractedContent,
      ].join("\n");
    } else {
      console.warn("Orchestrator: No content extracted from PDF/URL", {
        hasUserMessage: !!userMessage,
        hasFileParts: !!lastUserMessage?.parts?.some((p) => p.type === "file"),
      });
    }

    console.log("Orchestrator: Enhanced user message", {
      originalLength: userMessage.length,
      enhancedLength: enhancedUserMessage.length,
      hasExtractedContent: extractedContent.length > 0,
    });

    // Get the appropriate agent for current step
    const agent = this.agents.get(context.step);
    if (!agent) {
      throw new Error(`No agent found for step: ${context.step}`);
    }

    // Convert UI messages to core messages for agent
    const coreMessages = convertToCoreMessages(messages);

    // Process through agent with enhanced user message
    const result = await agent.process({
      sessionId,
      userId,
      context,
      conversationHistory: coreMessages,
      userMessage: enhancedUserMessage,
    });

    if (!result.success) {
      // Log detailed error information for debugging
      console.error("Agent processing failed:", {
        error: result.error,
        sessionId,
        step: context.step,
        userMessagePreview: userMessage.substring(0, 200),
      });
      throw new Error(result.error ?? "Agent processing failed");
    }

    // Save conversation messages to DB (text only, no structured data)
    const lastUserMessageForDB = messages[messages.length - 1];
    await this.saveConversationMessage(
      sessionId,
      "user",
      userMessage,
      lastUserMessageForDB,
      {
        workflowStep: context.step,
      },
    );

    await this.saveConversationMessage(
      sessionId,
      "assistant",
      result.conversationResponse ?? "",
      undefined,
      {
        structuredDataReference: "stored_in_session", // Reference, not the data itself
        workflowStep: context.step,
      },
    );

    // Save structured output to appropriate table
    if (result.data) {
      await this.saveStructuredOutput(sessionId, context.step, result.data);
    }

    // Update workflow context in DB
    const updatedContext = result.updatedContext ?? context;
    if (result.nextStep) {
      updatedContext.step = result.nextStep as WorkflowStep;
    }

    // Handle fact confirmation: if user confirms facts, move from extractedFacts to confirmedFacts
    if (context.step === "fact_extraction" && context.extractedFacts) {
      // Check if user message indicates confirmation
      const confirmationPatterns = [
        /ready to proceed/i,
        /these facts look good/i,
        /let's proceed/i,
        /continue/i,
        /confirm/i,
        /approve/i,
        /proceed with script/i,
        /proceed to script/i,
      ];

      if (confirmationPatterns.some((p) => p.test(userMessage))) {
        // Move extractedFacts to confirmedFacts and advance step
        updatedContext.confirmedFacts = context.extractedFacts;
        updatedContext.extractedFacts = undefined; // Clear extracted facts
        updatedContext.step = "script_generation";
      }
    }

    await this.updateWorkflowContext(sessionId, updatedContext);

    // Execute background actions
    if (result.backgroundAction) {
      result.backgroundAction().catch((error) => {
        console.error("Background action error:", error);
      });
    }

    return {
      response: result.conversationResponse ?? "",
      structuredData: result.data,
      nextStep: updatedContext.step,
      updatedContext,
    };
  }

  /**
   * Load conversation history from DB
   */
  async loadConversationHistory(sessionId: string): Promise<UIMessage[]> {
    const dbMessages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(conversationMessages.createdAt);

    return dbMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant" | "system",
      parts: msg.parts
        ? (msg.parts as UIMessage["parts"])
        : [{ type: "text", text: msg.content }],
      metadata: msg.metadata
        ? (msg.metadata as Record<string, unknown>)
        : undefined,
    }));
  }

  /**
   * Load or create workflow context
   */
  private async loadOrCreateContext(
    sessionId: string,
    userId: string,
    messages: UIMessage[],
  ): Promise<WorkflowContext> {
    const session = await db.query.videoSessions.findFirst({
      where: eq(videoSessions.id, sessionId),
    });

    if (session?.workflowContext) {
      return session.workflowContext as WorkflowContext;
    }

    // Create default context
    const defaultContext: WorkflowContext = {
      step: "fact_extraction",
      sessionId,
    };

    // Infer context from messages if available
    // Check for confirmed facts in conversation
    for (const msg of [...messages].reverse()) {
      if (msg.role === "assistant") {
        const textPart = msg.parts?.find(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        );
        if (textPart?.text) {
          // Try to parse facts from message (for resuming sessions)
          const { parseFactsFromMessage } = await import("@/lib/factParsing");
          const facts = parseFactsFromMessage(textPart.text);
          if (facts && facts.length > 0) {
            defaultContext.confirmedFacts = facts.map((f) => ({
              concept: f.concept,
              details: f.details,
            }));
            // Check if user confirmed
            const userMessages = messages.filter((m) => m.role === "user");
            const lastUserMessage = userMessages[userMessages.length - 1];
            const userText =
              lastUserMessage?.parts?.find(
                (part): part is { type: "text"; text: string } =>
                  part.type === "text",
              )?.text ?? "";

            const confirmationPatterns = [
              /yes/i,
              /approve/i,
              /confirm/i,
              /continue/i,
            ];
            if (confirmationPatterns.some((p) => p.test(userText))) {
              defaultContext.step = "script_generation";
            }
            break;
          }
        }
      }
    }

    return defaultContext;
  }

  /**
   * Save conversation message to DB (text only, no structured data)
   */
  private async saveConversationMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    uiMessage?: UIMessage,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(conversationMessages).values({
      id: nanoid(),
      sessionId,
      role,
      content,
      parts: uiMessage?.parts
        ? JSON.parse(JSON.stringify(uiMessage.parts))
        : null,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
      createdAt: new Date(),
    });
  }

  /**
   * Save structured output to appropriate table
   */
  private async saveStructuredOutput(
    sessionId: string,
    step: WorkflowStep,
    data: unknown,
  ): Promise<void> {
    if (step === "fact_extraction") {
      // Facts are saved to workflow context as extractedFacts (not confirmedFacts)
      // The workflow context is updated in updateWorkflowContext
      // No need to save directly to confirmedFacts column here
    } else if (step === "script_generation") {
      // Script is saved by NarrativeBuilderAgent, but we can update the session
      // The actual script data will come from the agent's background action
    } else if (step === "image_selection") {
      // Save images to video_assets table
      const imageData = data as {
        selectedImages: Array<{ id: string; url: string; prompt?: string }>;
      };
      for (const image of imageData.selectedImages) {
        await db.insert(videoAssets).values({
          id: nanoid(),
          sessionId,
          assetType: "image",
          url: image.url,
          metadata: {
            imageId: image.id,
            prompt: image.prompt,
          },
          createdAt: new Date(),
        });
      }
    }
  }

  /**
   * Update workflow context in session
   */
  private async updateWorkflowContext(
    sessionId: string,
    context: WorkflowContext,
  ): Promise<void> {
    await db
      .update(videoSessions)
      .set({
        workflowContext: JSON.parse(JSON.stringify(context)),
        currentStep: context.step,
        updatedAt: new Date(),
      })
      .where(eq(videoSessions.id, sessionId));
  }
}
