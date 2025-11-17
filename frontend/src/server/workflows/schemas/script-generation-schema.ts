import { z } from "zod";

export const ScriptSegmentSchema = z.object({
  id: z.string().describe("Unique segment identifier"),
  type: z
    .enum(["hook", "concept_introduction", "process_explanation", "conclusion"])
    .describe("Segment type"),
  start_time: z.number().describe("Start time in seconds"),
  duration: z.number().describe("Duration in seconds"),
  narration: z.string().describe("Script text to narrate"),
  visual_guidance: z.string().describe("Description of what should be shown visually"),
  key_concepts: z.array(z.string()).describe("Key concepts covered in this segment"),
  educational_purpose: z.string().describe("Why this segment matters educationally"),
});

export const ScriptOutputSchema = z.object({
  total_duration: z.number().describe("Total script duration in seconds"),
  reading_level: z.string().describe("Reading level (e.g., '6.5')"),
  key_terms_count: z.number().describe("Number of key terms introduced"),
  segments: z.array(ScriptSegmentSchema).length(4).describe("Four script segments"),
});

export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

