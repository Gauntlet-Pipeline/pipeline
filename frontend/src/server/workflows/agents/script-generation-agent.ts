import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { BaseAgent, type AgentInput } from "./base-agent";
import {
  ScriptOutputSchema,
  type ScriptOutput,
} from "../schemas/script-generation-schema";
import type { WorkflowContext } from "@/types/workflow";
import { env } from "@/env";
import { NarrativeBuilderAgent } from "@/server/agents/narrative-builder";

export class ScriptGenerationAgent extends BaseAgent<unknown, ScriptOutput> {
  schema = ScriptOutputSchema;

  systemPrompt = `You are helping generate an educational video script based on confirmed facts.

The teacher has approved the facts. A script is being generated in the background.

Your role is to:
1. Acknowledge that script generation has started
2. Inform the teacher that they'll be able to review the script soon
3. Once the script is ready, guide them to the next step (image selection)

Be conversational and helpful.`;

  protected async execute(input: AgentInput): Promise<{
    data: ScriptOutput;
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

    // Load confirmed_facts from database if not in context
    let confirmedFacts = context.confirmedFacts;
    if (!confirmedFacts || confirmedFacts.length === 0) {
      const { db } = await import("@/server/db");
      const { videoSessions } = await import("@/server/db/video-generation/schema");
      const { eq } = await import("drizzle-orm");

      const session = await db.query.videoSessions.findFirst({
        where: eq(videoSessions.id, sessionId),
      });

      if (session?.confirmedFacts && Array.isArray(session.confirmedFacts)) {
        confirmedFacts = session.confirmedFacts as Array<{
          concept: string;
          details: string;
        }>;
      }
    }

    if (!confirmedFacts || confirmedFacts.length === 0) {
      throw new Error("Confirmed facts are required for script generation");
    }

    const topic = context.topic ?? "Educational Content";
    const targetDuration = 60;

    // Trigger script generation in background using existing NarrativeBuilderAgent
    const backgroundAction = async () => {
      const agent = new NarrativeBuilderAgent();
      await agent
        .process({
          sessionId: sessionId,
          data: {
            topic,
            facts: confirmedFacts, // Use confirmedFacts loaded from DB
            target_duration: targetDuration,
          },
        })
        .catch((error) => {
          console.error("Error generating script:", error);
          throw error;
        });
    };

    // For now, we'll use the NarrativeBuilderAgent which returns unstructured JSON
    // In the future, we could refactor it to use generateObject
    // For now, return a placeholder response and let the background action handle it
    return {
      data: {
        total_duration: targetDuration,
        reading_level: "6.5",
        key_terms_count: confirmedFacts.length, // Use confirmedFacts loaded from DB
        segments: [], // Will be populated by NarrativeBuilderAgent
      } as ScriptOutput,
      conversationResponse:
        "Great! I'm generating your educational script now. This will take a moment. Once it's ready, you'll be able to review it in the main panel.",
      updatedContext: {
        ...context,
        step: "script_generation",
      },
      backgroundAction,
      cost: 0, // Will be calculated by NarrativeBuilderAgent
    };
  }
}

