import { z } from "zod";
import type { WorkflowStep } from "@/types/workflow";

/**
 * Unified response schema for OrchestratorAgent
 * Ensures clean separation between chat messages and structured documents
 */
export const OrchestratorResponseSchema = z.object({
  message: z
    .string()
    .describe("Conversational response to user - displayed ONLY in chat panel"),
  data: z
    .unknown()
    .optional()
    .describe("Structured data for database storage (facts, script, images) - NOT displayed in UI"),
  document: z
    .unknown()
    .optional()
    .describe("Document object for main panel display (editable facts, script, images) - displayed ONLY in main panel"),
  nextStep: z
    .enum([
      "fact_extraction",
      "script_generation",
      "image_selection",
      "completed",
    ])
    .optional()
    .describe("Next workflow step"),
});

export type OrchestratorResponse = z.infer<typeof OrchestratorResponseSchema>;

