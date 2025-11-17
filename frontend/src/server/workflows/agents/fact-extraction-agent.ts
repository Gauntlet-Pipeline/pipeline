import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { type z } from "zod";
import { BaseAgent, type AgentInput } from "./base-agent";
import {
  FactExtractionOutputSchema,
  type FactExtractionOutput,
} from "../schemas/fact-extraction-schema";
import type { WorkflowContext } from "@/types/workflow";
import { env } from "@/env";

export class FactExtractionAgent extends BaseAgent<
  unknown,
  FactExtractionOutput
> {
  schema = FactExtractionOutputSchema as z.ZodSchema<FactExtractionOutput>;

  systemPrompt = `You are a helpful AI assistant helping a teacher build educational video content.

When the teacher provides learning materials (topic, learning objective, key points, PDFs, or URLs), your task is to:

1. Extract key educational facts from the materials
2. Return the facts in a structured format
3. Be conversational and helpful in your response

Extract 5-15 key educational facts that are:
- Clear and well-defined concepts
- Relevant to teaching and learning
- Suitable for use in an educational video script
- Accurate and educational

After extracting facts, confirm with the teacher and wait for their approval before moving to the next step.`;

  protected async execute(input: AgentInput): Promise<{
    data: FactExtractionOutput;
    conversationResponse: string;
    nextStep?: string;
    updatedContext?: WorkflowContext;
    backgroundAction?: () => Promise<void>;
    cost?: number;
  }> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { userMessage, conversationHistory } = input;

    // Use generateObject for structured output
    let object: FactExtractionOutput;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;

    try {
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: this.schema,
        system: this.systemPrompt,
        messages: [
          ...conversationHistory,
          { role: "user", content: userMessage },
        ],
      });
      object = result.object;
      usage = result.usage;
    } catch (error) {
      // Log detailed error for debugging schema validation issues
      console.error("FactExtractionAgent generateObject error:", {
        error: error instanceof Error ? error.message : String(error),
        userMessagePreview: userMessage.substring(0, 200),
        schema: "FactExtractionOutputSchema",
      });

      // Provide a more helpful error message
      if (error instanceof Error) {
        if (
          error.message.includes("schema") ||
          error.message.includes("No object generated")
        ) {
          throw new Error(
            `Failed to extract facts in the required format. The AI response didn't match the expected structure. ` +
              `This usually means the materials need to be more specific or contain clearer educational content. ` +
              `Original error: ${error.message}`,
          );
        }
      }
      throw error;
    }

    // Calculate cost (GPT-4o-mini: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const cost =
      (inputTokens * 0.15) / 1_000_000 + (outputTokens * 0.6) / 1_000_000;

    // Extract topic if available
    const topic = object.topic ?? this.extractTopicFromMessage(userMessage);

    return {
      data: object,
      conversationResponse: this.formatFactsResponse(object),
      // Don't advance step - wait for user confirmation
      updatedContext: {
        step: "fact_extraction", // Stay in this step
        topic,
        extractedFacts: object.facts.map((f) => ({
          // Save as extractedFacts (pending review), not confirmedFacts
          concept: f.concept,
          details: f.details,
        })),
        // Don't set confirmedFacts until user confirms
      },
      cost,
    };
  }

  private formatFactsResponse(output: FactExtractionOutput): string {
    // Simple conversational response - don't list all facts
    // Facts are shown in the main panel for review
    return `I've analyzed your materials and extracted ${output.facts.length} key educational facts. Please review them in the main panel and let me know when you're ready to proceed with script generation.`;
  }

  private extractTopicFromMessage(message: string): string {
    const topicMatch = /topic[:\s]+([^\n]+)/i.exec(message);
    return topicMatch?.[1]?.trim() ?? "Educational Content";
  }
}
