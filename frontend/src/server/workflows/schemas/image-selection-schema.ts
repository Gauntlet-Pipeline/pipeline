import { z } from "zod";

export const ImageOptionSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  prompt: z.string().describe("Prompt used to generate this image"),
  segmentId: z.string().optional().describe("Associated script segment ID"),
});

export const ImageSelectionOutputSchema = z.object({
  selectedImages: z.array(ImageOptionSchema).min(1).max(2).describe("User-selected images"),
  reason: z.string().optional().describe("Why these images were selected"),
});

export type ImageSelectionOutput = z.infer<typeof ImageSelectionOutputSchema>;

