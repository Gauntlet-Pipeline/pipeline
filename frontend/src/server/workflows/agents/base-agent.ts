import { type z } from "zod";
import type { ModelMessage } from "ai";
import type { WorkflowContext } from "@/types/workflow";

export interface AgentInput {
  sessionId: string;
  userId: string;
  context: WorkflowContext;
  conversationHistory: ModelMessage[];
  userMessage: string;
  inputData?: unknown;
}

export interface AgentOutput<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  nextStep?: string;
  updatedContext?: WorkflowContext;
  conversationResponse?: string; // Human-readable response for chat
  backgroundAction?: () => Promise<void>;
  cost?: number;
  duration?: number;
}

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  abstract schema: z.ZodSchema<TOutput>;
  abstract systemPrompt: string;

  /**
   * Process the agent's task and return structured output
   */
  async process(
    input: AgentInput & { inputData?: TInput },
  ): Promise<AgentOutput<TOutput>> {
    const startTime = Date.now();
    try {
      const result = await this.execute(input);
      const duration = (Date.now() - startTime) / 1000;

      return {
        success: true,
        data: result.data,
        conversationResponse: result.conversationResponse,
        nextStep: result.nextStep,
        updatedContext: result.updatedContext,
        backgroundAction: result.backgroundAction,
        cost: result.cost,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  protected abstract execute(
    input: AgentInput & { inputData?: TInput },
  ): Promise<{
    data: TOutput;
    conversationResponse: string;
    nextStep?: string;
    updatedContext?: WorkflowContext;
    backgroundAction?: () => Promise<void>;
    cost?: number;
  }>;
}
