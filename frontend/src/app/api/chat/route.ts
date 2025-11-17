import { auth } from "@/server/auth";
import { env } from "@/env";
import type { UIMessage } from "ai";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { OrchestratorAgent } from "@/server/workflows/orchestrator-agent";
import type { OrchestratorResponse } from "@/server/workflows/schemas/orchestrator-response-schema";
import { nanoid } from "nanoid";
import { db } from "@/server/db";
import { videoSessions } from "@/server/db/video-generation/schema";

export const runtime = "nodejs";

const orchestratorAgent = new OrchestratorAgent();

/**
 * POST /api/chat
 *
 * AI chat endpoint with workflow orchestration.
 * Handles multi-step workflow (fact extraction → script generation → image selection)
 * using agent-based architecture with structured outputs.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(
        "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.",
        { status: 500 },
      );
    }

    // Try to get sessionId from body first, then from headers
    const body = (await req.json()) as {
      messages?: UIMessage[];
      sessionId?: string;
    };
    const sessionIdFromHeader = req.headers.get("x-session-id");
    const { messages, sessionId: providedSessionId } = body;
    const sessionIdFromBody = providedSessionId;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages array is required", { status: 400 });
    }

    // Get or create session ID (from body or header)
    let sessionId = sessionIdFromBody ?? sessionIdFromHeader ?? undefined;
    if (!sessionId) {
      // Create new session
      sessionId = nanoid();
      await db.insert(videoSessions).values({
        id: sessionId,
        userId: session.user.id,
        status: "created",
        currentStep: "fact_extraction",
        workflowContext: {
          step: "fact_extraction",
          sessionId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      // Load conversation history from DB if resuming
      const dbMessages =
        await orchestratorAgent.loadConversationHistory(sessionId);
      if (dbMessages.length > 0) {
        // Merge DB messages with new messages (avoid duplicates by checking IDs)
        const existingIds = new Set(dbMessages.map((m) => m.id));
        const newMessages = messages.filter(
          (m) => !m.id || !existingIds.has(m.id),
        );
        messages.unshift(...dbMessages, ...newMessages);
      }
    }

    // Get last user message
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const userTextPart = lastUserMessage?.parts?.find(
      (part: { type: string }): part is { type: "text"; text: string } =>
        part.type === "text",
    );
    const userContent = userTextPart?.text ?? "";
    const hasFiles =
      lastUserMessage?.parts?.some(
        (p: { type: string }) => p.type !== "text",
      ) ?? false;

    // Allow processing if there's text OR files
    if (!userContent && !hasFiles) {
      return new Response("User message content or files are required", {
        status: 400,
      });
    }

    // Process through orchestrator agent (handles structured outputs and DB saving)
    // Orchestrator returns a streamable value that streams both chat messages and structured documents
    // Orchestrator will extract PDF/URL content lazily when extract_facts tool is called
    console.log("[Chat Route] Starting orchestrator process", {
      sessionId,
      userContentLength: userContent.length,
      hasFiles,
      messagesCount: messages.length,
    });

    try {
      const { result, sessionId: streamSessionId } =
        await orchestratorAgent.process(
          sessionId,
          session.user.id,
          userContent || "", // Pass empty string if no text, orchestrator will handle files
          messages,
        );

      console.log("[Chat Route] Orchestrator process completed, got result", {
        streamSessionId,
      });

      // CRITICAL: Access partialObjectStream only once and immediately tee it
      // Accessing it multiple times or checking it first will lock the stream
      console.log(
        "[Chat Route] Accessing partialObjectStream and teeing immediately",
      );
      let dbStream: ReadableStream<Partial<OrchestratorResponse>>;
      let frontendStream: ReadableStream<Partial<OrchestratorResponse>>;

      try {
        // Access partialObjectStream once and tee it in one operation
        [dbStream, frontendStream] = result.partialObjectStream.tee();
        console.log("[Chat Route] Streams teed successfully", {
          dbStreamLocked: dbStream.locked,
          frontendStreamLocked: frontendStream.locked,
        });
      } catch (error) {
        console.error(
          "[Chat Route] Error accessing/teeing partialObjectStream:",
          error,
        );
        throw new Error(
          `Failed to access partialObjectStream: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Helper function to extract data from chunk (handles both direct and nested in properties)
      const getDataFromChunk = (chunk: unknown): unknown => {
        if (!chunk || typeof chunk !== "object") return undefined;

        // Check if it's a schema structure with nested properties
        if (
          "properties" in chunk &&
          typeof chunk.properties === "object" &&
          chunk.properties !== null
        ) {
          const props = chunk.properties as Record<string, unknown>;
          if ("data" in props) {
            return props.data;
          }
        }

        // Check if data is directly on the object
        if ("data" in chunk) {
          return (chunk as { data: unknown }).data;
        }

        return undefined;
      };

      // Helper function to extract message from chunk (handles both direct and nested in properties)
      const getMessageFromChunk = (chunk: unknown): string | undefined => {
        if (!chunk || typeof chunk !== "object") return undefined;

        // Check if it's a schema structure with nested properties
        if (
          "properties" in chunk &&
          typeof chunk.properties === "object" &&
          chunk.properties !== null
        ) {
          const props = chunk.properties as Record<string, unknown>;
          if ("message" in props && typeof props.message === "string") {
            return props.message;
          }
        }

        // Check if message is directly on the object
        if ("message" in chunk && typeof chunk.message === "string") {
          return chunk.message;
        }

        return undefined;
      };

      // Process stream asynchronously to save data to database
      void (async () => {
        let lastValue: Partial<OrchestratorResponse> | undefined;
        let dbStreamChunkCount = 0;
        let lastSavedData: unknown = undefined;
        let saveDebounceTimer: NodeJS.Timeout | null = null;
        let pendingSaveData: {
          value: unknown;
          response: Partial<OrchestratorResponse>;
        } | null = null;

        const performSave = async (
          dataValue: unknown,
          response: Partial<OrchestratorResponse>,
        ) => {
          await orchestratorAgent.saveStructuredData(
            streamSessionId,
            dataValue,
            response as OrchestratorResponse,
          );
          lastSavedData = dataValue;
          console.log("[Chat Route] Data saved to DB");
        };

        try {
          // Convert ReadableStream to async iterable
          const reader = dbStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log("[Chat Route] DB stream completed", {
                  totalChunks: dbStreamChunkCount,
                });
                break;
              }

              dbStreamChunkCount++;

              // Extract data from chunk (handles nested properties structure)
              const dataValue = getDataFromChunk(value);
              const messageValue = getMessageFromChunk(value);

              // Build a proper OrchestratorResponse from the chunk
              if (value && typeof value === "object") {
                const response: Partial<OrchestratorResponse> = {};

                if (messageValue) {
                  response.message = messageValue;
                }

                if (dataValue) {
                  response.data = dataValue;
                }

                // Extract document if present
                if (
                  "properties" in value &&
                  typeof value.properties === "object" &&
                  value.properties !== null
                ) {
                  const props = value.properties as Record<string, unknown>;
                  if ("document" in props) {
                    response.document = props.document;
                  }
                  if ("nextStep" in props) {
                    response.nextStep =
                      props.nextStep as OrchestratorResponse["nextStep"];
                  }
                } else {
                  if ("document" in value) {
                    response.document = (
                      value as { document: unknown }
                    ).document;
                  }
                  if ("nextStep" in value) {
                    response.nextStep = (value as { nextStep: unknown })
                      .nextStep as OrchestratorResponse["nextStep"];
                  }
                }

                if (Object.keys(response).length > 0) {
                  lastValue = response;
                }
              } else {
                lastValue = value;
              }

              // Track the latest data value, but don't save on every chunk
              // We'll save at the end of the stream to avoid excessive DB writes
              if (dataValue) {
                lastValue = {
                  ...lastValue,
                  data: dataValue,
                } as Partial<OrchestratorResponse>;
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Save structured data and conversation message at the end
          if (lastValue && typeof lastValue === "object") {
            // Save structured data if present
            if ("data" in lastValue && lastValue.data) {
              console.log("[Chat Route] Saving final structured data to DB", {
                dataKeys:
                  lastValue.data && typeof lastValue.data === "object"
                    ? Object.keys(lastValue.data)
                    : [],
                hasDocument: "document" in lastValue && !!lastValue.document,
                documentType:
                  lastValue.document &&
                  typeof lastValue.document === "object" &&
                  "type" in lastValue.document
                    ? (lastValue.document as { type: string }).type
                    : undefined,
                hasMessage: "message" in lastValue && !!lastValue.message,
                messageLength:
                  lastValue.message && typeof lastValue.message === "string"
                    ? lastValue.message.length
                    : 0,
              });
              await orchestratorAgent.saveStructuredData(
                streamSessionId,
                lastValue.data,
                lastValue as OrchestratorResponse,
              );
            }

            // Save conversation message if present
            if (
              "message" in lastValue &&
              lastValue.message &&
              typeof lastValue.message === "string"
            ) {
              console.log("[Chat Route] Saving conversation message to DB", {
                messageLength: lastValue.message.length,
                messagePreview: lastValue.message.substring(0, 200),
              });
              await orchestratorAgent.saveConversationMessage(
                streamSessionId,
                lastValue.message,
              );
            }
          }
        } catch (error) {
          console.error("Error processing orchestrator stream for DB:", error);
          // Don't throw - let the frontend stream continue
        }
      })();

      // Collect the complete message from the stream
      let completeMessage = "";
      const frontendReader = frontendStream.getReader();

      try {
        while (true) {
          const { done, value } = await frontendReader.read();
          if (done) break;

          const messageValue = getMessageFromChunk(value);
          if (messageValue && messageValue.length > completeMessage.length) {
            completeMessage = messageValue;
          }
        }
      } finally {
        frontendReader.releaseLock();
      }

      console.log("[Chat Route] Collected complete message", {
        messageLength: completeMessage.length,
        messagePreview: completeMessage.substring(0, 200),
      });

      // Use streamText with the complete message to create a properly formatted AI SDK response
      // This ensures useChat can parse the message correctly
      const textResult = streamText({
        model: openai("gpt-4o-mini"),
        prompt: completeMessage, // Use our message as the prompt result
      });

      // Return the properly formatted stream response
      return textResult.toTextStreamResponse({
        headers: {
          "X-Session-Id": streamSessionId,
        },
      });
    } catch (error) {
      const orchestratorError =
        error instanceof Error ? error : new Error(String(error));
      console.error("Orchestrator error:", orchestratorError);
      console.error("Error details:", {
        message: orchestratorError.message,
        sessionId,
        userMessagePreview: userContent.substring(0, 200) || "[files only]",
      });

      // Return an error response
      return new Response(
        JSON.stringify({
          error:
            "Failed to process your request. Please try again or provide more specific learning materials.",
          details:
            orchestratorError.message.includes("schema") ||
            orchestratorError.message.includes("No object generated")
              ? "The AI couldn't extract facts in the required format. Please ensure your materials contain clear educational content."
              : orchestratorError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: "An error occurred while processing your request.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
