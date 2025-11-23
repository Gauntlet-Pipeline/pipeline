import { type Tool } from "ai";
import z from "zod";
import { FactExtractionAgent } from "@/server/agents/fact-extraction";
import { db } from "@/server/db";
import { videoSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const extractFactsTool: Tool = {
  description:
    "Extract educational facts from learning materials (PDF, URL, or text). Returns facts pending user review.",
  inputSchema: z.object({
    content: z
      .string()
      .describe(
        "The content to extract facts from (text, PDF content, or URL)",
      ),
    sessionId: z
      .string()
      .optional()
      .describe("Session ID to access existing session data from database"),
  }),
  execute: async ({
    content,
    sessionId,
  }: {
    content: string;
    sessionId?: string;
  }) => {
    try {
      let materialText = content; // Keep user's original message content
      let pdfUrl: string | undefined;

      // If sessionId provided, try to load PDF URL and fallback text
      if (sessionId) {
        try {
          const [session] = await db
            .select({
              sourceMaterials: videoSessions.sourceMaterials,
            })
            .from(videoSessions)
            .where(eq(videoSessions.id, sessionId))
            .limit(1);

          if (session?.sourceMaterials) {
            const materials = session.sourceMaterials as {
              text?: string;
              pdfUrl?: string;
            };

            // Extract PDF URL if available
            pdfUrl = materials.pdfUrl;

            // Only use extracted text as fallback if NO PDF URL is available
            // This preserves the user's message context when PDF is present
            if (!pdfUrl && materials.text) {
              materialText = materials.text;
            }
          }
        } catch (error) {
          console.error("Error loading source materials:", error);
          // Continue with provided content if loading fails
        }
      }

      // Use FactExtractionAgent for better fact extraction quality
      const agent = new FactExtractionAgent();

      const result = await agent.process({
        sessionId: sessionId ?? "",
        data: {
          content: materialText,
          pdfUrl,
        },
      });

      if (!result.success) {
        return JSON.stringify({
          facts: [],
          message: `Failed to extract facts: ${result.error ?? "Unknown error"}`,
        });
      }

      // Return in the expected tool format
      return JSON.stringify({
        facts: result.data.facts ?? [],
        message: result.data.message ?? "Facts extracted successfully",
        topic: result.data.topic,
        learningObjective: result.data.learningObjective,
      });
    } catch (error) {
      console.error("Error extracting facts:", error);
      return JSON.stringify({
        facts: [],
        message: `Failed to extract facts: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
};
