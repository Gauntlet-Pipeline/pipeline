import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import type { WorkflowStep } from "@/types/workflow";

interface WorkflowSessionData {
  id: string;
  userId: string;
  status: string;
  topic: string | null;
  learningObjective: string | null;
  confirmedFacts: Array<{ concept: string; details: string }> | null;
  generatedScript: unknown;
  currentStep: string | null;
  workflowContext: {
    step: WorkflowStep;
    sessionId?: string;
    topic?: string;
    learningObjective?: string;
    extractedFacts?: Array<{ concept: string; details: string }>;
    confirmedFacts?: Array<{ concept: string; details: string }>;
    generatedScript?: unknown;
    selectedImages?: Array<{ id: string; url: string; prompt?: string }>;
    metadata?: Record<string, unknown>;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  conversationMessages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    parts: unknown;
    metadata: unknown;
    createdAt: Date;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    url: string | null;
    metadata: unknown;
    createdAt: Date;
  }>;
}

export interface UseWorkflowSessionReturn {
  sessionId: string | null;
  session: WorkflowSessionData | null;
  currentStep: WorkflowStep;
  loading: boolean;
  error: string | null;
  setSessionId: (id: string | null) => void;
  refreshSession: () => Promise<void>;
}

export function useWorkflowSession(
  initialSessionId?: string | null,
): UseWorkflowSessionReturn {
  const [sessionId, setSessionIdState] = useState<string | null>(
    initialSessionId ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to get sessionId from URL params
  const searchParams = useSearchParams();
  const urlSessionId = searchParams?.get("sessionId");

  useEffect(() => {
    if (urlSessionId && !sessionId) {
      setSessionIdState(urlSessionId);
    }
  }, [urlSessionId, sessionId]);

  // Query session data
  const {
    data,
    isLoading: queryLoading,
    error: queryError,
    refetch,
  } = api.session.getById.useQuery(
    { sessionId: sessionId! },
    {
      enabled: !!sessionId,
      refetchInterval: (query) => {
        // Poll every 3 seconds if workflow is active (not completed)
        // Increased from 2s to 3s to reduce database load
        const data = query.state.data;
        if (data?.workflowContext?.step === "completed") {
          return false; // Stop polling when workflow is complete
        }
        // Only poll if we have a sessionId
        if (!sessionId) {
          return false;
        }
        return 3000; // 3 seconds
      },
      // Prevent refetching on window focus to reduce unnecessary queries
      refetchOnWindowFocus: false,
      // Prevent refetching on reconnect
      refetchOnReconnect: false,
      // Keep previous data while refetching to prevent UI flicker
      placeholderData: (previousData) => previousData,
    },
  );

  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    setError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (sessionId) {
      await refetch();
    }
  }, [sessionId, refetch]);

  // Determine current step
  const currentStep: WorkflowStep =
    data?.workflowContext?.step ??
    (data?.currentStep as WorkflowStep | undefined) ??
    "fact_extraction";

  useEffect(() => {
    setLoading(queryLoading);
  }, [queryLoading]);

  useEffect(() => {
    if (queryError) {
      setError(
        queryError instanceof Error
          ? queryError.message
          : "Failed to load session",
      );
    } else {
      setError(null);
    }
  }, [queryError]);

  return {
    sessionId,
    session: data ?? null,
    currentStep,
    loading,
    error,
    setSessionId,
    refreshSession,
  };
}
