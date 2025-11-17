import { BaseAgent, type AgentInput } from "./base-agent";
import {
  ImageSelectionOutputSchema,
  type ImageSelectionOutput,
} from "../schemas/image-selection-schema";
import type { WorkflowContext } from "@/types/workflow";
import { env } from "@/env";
import {
  fetchImagesFromGoogle,
  generateImageSearchQueries,
} from "@/server/utils/google-search";
import { db } from "@/server/db";
import { videoSessions } from "@/server/db/video-generation/schema";
import { eq } from "drizzle-orm";

export class ImageSelectionAgent extends BaseAgent<
  unknown,
  ImageSelectionOutput
> {
  schema = ImageSelectionOutputSchema;

  systemPrompt = `You are helping the teacher select images for their educational video.

Images have been fetched and are ready for review. Your role is to:
1. Understand which images the teacher wants to use
2. Extract their selection in a structured format
3. Be conversational and helpful

The teacher can select 1-2 images from the available options.`;

  protected async execute(input: AgentInput): Promise<{
    data: ImageSelectionOutput;
    conversationResponse: string;
    nextStep?: string;
    updatedContext?: WorkflowContext;
    backgroundAction?: () => Promise<void>;
    cost?: number;
  }> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { context, sessionId } = input;

    // First, fetch images using Google Programmable Search Engine
    const availableImages = await this.fetchImagesForScript(context, sessionId);

    if (availableImages.length === 0) {
      return {
        data: {
          availableImages: [],
          selectedImages: [],
        } as ImageSelectionOutput,
        conversationResponse:
          "I couldn't find images for your script. Please make sure the script has been generated first.",
        updatedContext: {
          ...context,
          step: "image_selection",
        },
        cost: 0,
      };
    }

    // If images are available, return them for user selection
    // User will select images in the UI, not through chat
    return {
      data: {
        availableImages,
        selectedImages: [], // Will be populated when user selects images in UI
      } as ImageSelectionOutput & { availableImages: typeof availableImages },
      conversationResponse: `I've found ${availableImages.length} images for your script. Please review them in the main panel and select 1-2 images to use.`,
      updatedContext: {
        ...context,
        step: "image_selection",
        selectedImages: availableImages,
      },
      cost: 0,
    };
  }

  private async fetchImagesForScript(
    context: WorkflowContext,
    sessionId: string,
  ): Promise<Array<{ id: string; url: string; prompt: string }>> {
    // Load script from database if not in context
    let script = context.generatedScript;
    if (!script) {
      const session = await db.query.videoSessions.findFirst({
        where: eq(videoSessions.id, sessionId),
      });
      script = session?.generatedScript;
    }

    if (!script) {
      return []; // No script available yet
    }

    // Generate search queries from script
    const searchQueries = generateImageSearchQueries(script);

    // Fetch images from Google
    try {
      const googleImages = await fetchImagesFromGoogle(searchQueries);

      // Format images for return
      return googleImages.map((img, index) => ({
        id: `img_${index}`,
        url: img.link,
        prompt: img.title || img.snippet,
      }));
    } catch (error) {
      console.error("Error fetching images from Google:", error);
      return []; // Return empty array on error
    }
  }

  private async saveSelectedImages(
    sessionId: string,
    images: ImageSelectionOutput["selectedImages"],
  ): Promise<void> {
    // TODO: Save to DB and ensure S3 uploads are complete
    // This would insert records into video_assets table
    console.log("Saving selected images:", images);
  }
}
