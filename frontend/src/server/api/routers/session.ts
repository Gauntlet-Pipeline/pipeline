import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  videoSessions,
  videoAssets,
  conversationMessages,
} from "@/server/db/video-generation/schema";
import { eq } from "drizzle-orm";
import type { WorkflowContext } from "@/types/workflow";

export const sessionRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.session?.user?.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Load session with workflow context
      const session = await db.query.videoSessions.findFirst({
        where: eq(videoSessions.id, input.sessionId),
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Load conversation messages
      const messages = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.sessionId, input.sessionId))
        .orderBy(conversationMessages.createdAt);

      // Load assets (images, etc.)
      const assets = await db
        .select()
        .from(videoAssets)
        .where(eq(videoAssets.sessionId, input.sessionId));

      return {
        id: session.id,
        userId: session.userId,
        status: session.status,
        topic: session.topic,
        learningObjective: session.learningObjective,
        confirmedFacts: session.confirmedFacts as Array<{
          concept: string;
          details: string;
        }> | null,
        generatedScript: session.generatedScript,
        currentStep: session.currentStep,
        workflowContext: session.workflowContext as WorkflowContext | null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        conversationMessages: messages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          parts: msg.parts,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        })),
        assets: assets.map((asset) => ({
          id: asset.id,
          assetType: asset.assetType,
          url: asset.url,
          metadata: asset.metadata,
          createdAt: asset.createdAt,
        })),
      };
    }),

  getConversationHistory: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.session?.user?.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Verify session belongs to user
      const session = await db.query.videoSessions.findFirst({
        where: eq(videoSessions.id, input.sessionId),
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Load conversation messages
      const messages = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.sessionId, input.sessionId))
        .orderBy(conversationMessages.createdAt);

      return messages.map((msg) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        parts: msg.parts,
        metadata: msg.metadata,
        createdAt: msg.createdAt,
      }));
    }),

  getWorkflowContext: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.session?.user?.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const session = await db.query.videoSessions.findFirst({
        where: eq(videoSessions.id, input.sessionId),
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      return {
        currentStep: session.currentStep,
        workflowContext: session.workflowContext as WorkflowContext | null,
        confirmedFacts: session.confirmedFacts as Array<{
          concept: string;
          details: string;
        }> | null,
        generatedScript: session.generatedScript,
      };
    }),
});
