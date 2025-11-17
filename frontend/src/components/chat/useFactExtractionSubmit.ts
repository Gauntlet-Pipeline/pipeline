import { useCallback } from "react";
import type { FileUIPart } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useFactExtraction } from "@/components/fact-extraction/FactExtractionContext";

/**
 * Custom hook for handling fact extraction submit logic.
 * Backend orchestrator handles PDF/URL extraction and fact parsing.
 * This hook just prepares and sends the message.
 */
export function useFactExtractionSubmit() {
  const factExtraction = useFactExtraction();

  const handleFactExtractionSubmit = useCallback(
    async (
      message: PromptInputMessage,
      sendMessage: (message: {
        role: "user";
        parts: Array<{ type: "text"; text: string } | FileUIPart>;
      }) => Promise<void>,
    ) => {
      if (!message.text.trim() && message.files.length === 0) return;

      // Set extracting state to show loading in main content
      factExtraction.setIsExtracting?.(true);

      // Prepare message parts - backend will handle extraction
      const parts: Array<{ type: "text"; text: string } | FileUIPart> = [];

      if (message.text.trim()) {
        parts.push({ type: "text", text: message.text.trim() });
      }

      // Include all files - backend orchestrator will extract content
      message.files.forEach((file) => {
        parts.push(file);
      });

      // Send message to backend - orchestrator handles the rest
      await sendMessage({
        role: "user",
        parts,
      });
    },
    [factExtraction],
  );

  return { handleFactExtractionSubmit };
}

