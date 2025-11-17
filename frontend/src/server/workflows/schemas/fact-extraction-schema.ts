import { z } from "zod";

export const FactSchema = z.object({
  concept: z.string().describe("Main concept or term"),
  details: z.string().describe("Clear explanation or definition"),
  confidence: z.number().min(0).max(1).default(0.8).describe("Confidence score"),
});

export const FactExtractionOutputSchema = z.object({
  facts: z.array(FactSchema).min(5).max(15).describe("Extracted educational facts"),
  topic: z.string().optional().describe("Detected topic from materials"),
  learningObjective: z.string().optional().describe("Detected learning objective"),
});

export type FactExtractionOutput = z.infer<typeof FactExtractionOutputSchema>;

