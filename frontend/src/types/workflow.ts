import type { Fact } from "./index";

export type WorkflowStep =
  | "fact_extraction"
  | "script_generation"
  | "image_selection"
  | "completed";

export interface WorkflowContext {
  step: WorkflowStep;
  sessionId?: string;
  topic?: string;
  learningObjective?: string;
  extractedFacts?: Array<{ concept: string; details: string }>; // Pending review
  confirmedFacts?: Array<{ concept: string; details: string }>; // Only after user confirms
  generatedScript?: unknown;
  selectedImages?: Array<{ id: string; url: string; prompt?: string }>;
  metadata?: Record<string, unknown>;
}

