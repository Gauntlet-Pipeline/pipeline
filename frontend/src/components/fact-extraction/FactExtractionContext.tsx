"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Fact } from "@/types";
import { useWorkflowSession } from "@/hooks/useWorkflowSession";

export interface FactExtractionContextValue {
  extractedFacts: Fact[];
  isExtracting: boolean;
  extractionError: string | null;
  extractFactsFromInput: (text: string, files: File[]) => Promise<void>;
  setExtractedFacts: (facts: Fact[]) => void;
  setIsExtracting: (isExtracting: boolean) => void;
  clearFacts: () => void;
  confirmFacts: (facts: Fact[]) => void;
  confirmedFacts: Fact[] | null;
  sessionId: string | null;
  isGeneratingScript: boolean;
  setIsGeneratingScript: (isGenerating: boolean) => void;
}

const FactExtractionContext = createContext<
  FactExtractionContextValue | undefined
>(undefined);

export function FactExtractionProvider({ children }: { children: ReactNode }) {
  const [extractedFacts, setExtractedFacts] = useState<Fact[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [confirmedFacts, setConfirmedFacts] = useState<Fact[] | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Use workflow session to get sessionId and load facts from session
  const workflowSession = useWorkflowSession();

  // Load facts from session data when session loads
  useEffect(() => {
    if (workflowSession.session) {
      // First check for extractedFacts (pending review) in workflow context
      const workflowContext = workflowSession.session.workflowContext;
      if (
        workflowContext?.extractedFacts &&
        workflowContext.extractedFacts.length > 0 &&
        !workflowContext.confirmedFacts
      ) {
        // Facts are extracted but not yet confirmed
        const sessionFacts: Fact[] = workflowContext.extractedFacts.map(
          (f) => ({
            concept: f.concept,
            details: f.details,
            confidence: 0.8, // Default confidence
          }),
        );
        setExtractedFacts(sessionFacts);
        setConfirmedFacts(null); // Not confirmed yet
        setIsExtracting(false); // Facts are loaded, stop loading state
      }
      // If confirmedFacts exist (either in workflow context or session), use those
      else if (
        workflowContext?.confirmedFacts ||
        workflowSession.session.confirmedFacts
      ) {
        const confirmedFactsData =
          workflowContext?.confirmedFacts ||
          workflowSession.session.confirmedFacts ||
          [];
        const sessionFacts: Fact[] = confirmedFactsData.map((f) => ({
          concept: f.concept,
          details: f.details,
          confidence: 0.8, // Default confidence
        }));
        setExtractedFacts(sessionFacts);
        setConfirmedFacts(sessionFacts);
        setIsExtracting(false); // Facts are loaded, stop loading state
      }
    }
  }, [
    workflowSession.session?.workflowContext?.extractedFacts,
    workflowSession.session?.workflowContext?.confirmedFacts,
    workflowSession.session?.confirmedFacts,
  ]);

  // Update sessionId from workflow session
  useEffect(() => {
    if (workflowSession.sessionId) {
      // SessionId is managed by workflow session
    }
  }, [workflowSession.sessionId]);

  // Fact extraction is now handled by backend orchestrator
  // This method is kept for backward compatibility but does nothing
  const extractFactsFromInput = useCallback(
    async (_text: string, _files: File[]) => {
      // Backend handles fact extraction via orchestrator
      // This is a no-op now
    },
    [],
  );

  const setExtractedFactsFromContext = useCallback((facts: Fact[]) => {
    setExtractedFacts(facts);
    setExtractionError(null);
    setIsExtracting(false); // Stop loading when facts are set
  }, []);

  const setIsExtractingFromContext = useCallback((extracting: boolean) => {
    setIsExtracting(extracting);
  }, []);

  const clearFacts = useCallback(() => {
    setExtractedFacts([]);
    setExtractionError(null);
  }, []);

  const confirmFacts = useCallback(async (facts: Fact[]) => {
    setConfirmedFacts(facts);
    // Facts will be saved to database by backend orchestrator
    // when the confirmation message is processed
    // The edited facts are included in the confirmation message
  }, []);

  // Determine if script is being generated based on workflow step
  useEffect(() => {
    const isGenerating =
      workflowSession.currentStep === "script_generation" &&
      !workflowSession.session?.generatedScript;
    setIsGeneratingScript(isGenerating);
  }, [workflowSession.currentStep, workflowSession.session?.generatedScript]);

  return (
    <FactExtractionContext.Provider
      value={{
        extractedFacts,
        isExtracting,
        extractionError,
        extractFactsFromInput,
        setExtractedFacts: setExtractedFactsFromContext,
        setIsExtracting: setIsExtractingFromContext,
        clearFacts,
        confirmFacts,
        confirmedFacts,
        sessionId: workflowSession.sessionId,
        isGeneratingScript,
        setIsGeneratingScript,
      }}
    >
      {children}
    </FactExtractionContext.Provider>
  );
}

export function useFactExtraction() {
  const context = useContext(FactExtractionContext);
  if (context === undefined) {
    throw new Error(
      "useFactExtraction must be used within a FactExtractionProvider",
    );
  }
  return context;
}
