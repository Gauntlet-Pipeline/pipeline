"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage, FileUIPart } from "ai";
import { CustomChatTransport } from "@/lib/custom-chat-transport";
import { useFactExtraction } from "@/components/fact-extraction/FactExtractionContext";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Suggestion } from "@/components/ai-elements/suggestion";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { PROMPTS } from "@/components/chat/chatConstants";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { useFactExtractionSubmit } from "@/components/chat/useFactExtractionSubmit";
import { ChatMessageProvider } from "@/components/chat/chat-message-context";
import { ScriptGenerationChainOfThought } from "@/components/generation/ScriptGenerationChainOfThought";
import { useWorkflowSession } from "@/hooks/useWorkflowSession";
import type { Fact } from "@/types";

export function ChatPreview() {
  const pathname = usePathname();
  const isCreatePage = pathname === "/dashboard/create";
  const factExtraction = useFactExtraction();

  // Get workflow session for sessionId
  const workflowSession = useWorkflowSession(factExtraction.sessionId);

  // Create custom transport with sessionId
  const transport = useMemo(
    () =>
      new CustomChatTransport({
        api: "/api/chat",
        sessionId: workflowSession.sessionId ?? undefined,
        onSessionCreated: (sessionId: string) => {
          console.log(
            "[ChatPreview] Setting session ID from server:",
            sessionId,
          );
          workflowSession.setSessionId(sessionId);
        },
      }),
    [workflowSession],
  );

  // Update transport sessionId when it changes
  useEffect(() => {
    transport.setSessionId(workflowSession.sessionId ?? undefined);
  }, [transport, workflowSession.sessionId]);

  // Use AI SDK's useChat hook for chat state management
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    onFinish: (event) => {
      console.log("[ChatPreview] onFinish called", {
        messageId: event.message.id,
        messageRole: event.message.role,
        partsCount: event.message.parts?.length ?? 0,
        parts: event.message.parts,
        hasSession: !!workflowSession.sessionId,
        sessionId: workflowSession.sessionId,
      });
      // Refresh session to get updated workflow state
      // Only refresh if we have a session ID
      if (workflowSession.sessionId) {
        console.log("[ChatPreview] Refreshing session after message finish");
        // Use a timeout to avoid excessive refetching
        setTimeout(() => {
          void workflowSession.refreshSession();
        }, 500);
      }
    },
    onError: (error) => {
      console.error("[ChatPreview] Chat error:", error);
    },
  });

  // Load conversation history when session loads
  useEffect(() => {
    if (
      workflowSession.session?.conversationMessages &&
      workflowSession.session.conversationMessages.length > 0 &&
      messages.length === 0
    ) {
      // Convert conversation messages from DB to UIMessage format
      const dbMessages: UIMessage[] =
        workflowSession.session.conversationMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          parts: msg.parts
            ? (msg.parts as UIMessage["parts"])
            : [{ type: "text", text: msg.content }],
          metadata: msg.metadata
            ? (msg.metadata as Record<string, unknown>)
            : undefined,
        }));
      setMessages(dbMessages);
    }
  }, [
    workflowSession.session?.conversationMessages,
    messages.length,
    setMessages,
  ]);

  // Use fact extraction submit hook
  const { handleFactExtractionSubmit } = useFactExtractionSubmit();

  // Track previous confirmedFacts to detect when facts are confirmed
  const prevConfirmedFactsRef = useRef<Fact[] | null>(null);

  // Add user message when facts are confirmed
  useEffect(() => {
    if (
      factExtraction.confirmedFacts &&
      factExtraction.confirmedFacts.length > 0 &&
      !prevConfirmedFactsRef.current
    ) {
      // Facts were just confirmed, send message
      // The backend orchestrator will detect the confirmation message
      // and move extractedFacts to confirmedFacts in the workflow context
      sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: "These facts look good, let's proceed with script generation",
          },
        ],
      }).catch((error) => {
        console.error("Error sending message to chat:", error);
      });
    }
    prevConfirmedFactsRef.current = factExtraction.confirmedFacts;
  }, [factExtraction.confirmedFacts, sendMessage]);

  // Handle PromptInput submit with text and file attachments
  const handleSubmit = async (
    message: PromptInputMessage,
    _event: React.FormEvent<HTMLFormElement>,
  ) => {
    if (!message.text.trim() && message.files.length === 0) return;

    // On create page, prepare message for AI fact extraction
    if (isCreatePage && !factExtraction.confirmedFacts) {
      await handleFactExtractionSubmit(message, sendMessage);
      return;
    }

    // Normal chat behavior for other pages or after facts are confirmed
    const parts: Array<{ type: "text"; text: string } | FileUIPart> = [];

    if (message.text.trim()) {
      parts.push({ type: "text", text: message.text.trim() });
    }

    message.files.forEach((file) => {
      parts.push(file);
    });

    await sendMessage({
      role: "user",
      parts,
    });
  };

  // Handle suggestion click
  const handleSuggestionClick = async (prompt: string) => {
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: prompt }],
    });
  };

  return (
    <ChatMessageProvider sendMessage={sendMessage}>
      <div className="flex h-full flex-col px-2 py-4">
        <Conversation className="mb-4">
          <ConversationContent>
            {messages.length === 0 && (
              <>
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse>
                      {isCreatePage
                        ? "I'll help you extract educational facts from your learning materials. Please provide:\n\n- Topic\n- Learning objective\n- Key points\n- PDF files or URLs (optional)\n\nI'll analyze the content and extract key facts for your review."
                        : "Hello, I'm your creative assistant. I can help you create lesson plans, suggest activities, and make topics more engaging for your students. What would you like to create?"}
                    </MessageResponse>
                  </MessageContent>
                </Message>
                {!isCreatePage && (
                  <div className="flex w-full flex-col gap-2">
                    {PROMPTS.map((prompt) => {
                      const IconComponent = prompt.icon;
                      return (
                        <Suggestion
                          key={prompt.text}
                          suggestion={prompt.prompt}
                          onClick={handleSuggestionClick}
                          className="justify-start"
                          size="sm"
                        >
                          <IconComponent className="mr-2 size-4" />
                          {prompt.text}
                        </Suggestion>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {messages.map((message: UIMessage, index: number) => {
              const isStreaming =
                status === "streaming" && index === messages.length - 1;
              const isStreamingAssistant =
                isStreaming && message.role === "assistant";

              return (
                <ChatMessage
                  key={message.id ?? index}
                  message={message}
                  index={index}
                  isStreaming={isStreaming}
                  isStreamingAssistant={isStreamingAssistant}
                  isCreatePage={isCreatePage}
                  factExtraction={factExtraction}
                />
              );
            })}
            {/* Show script generation chain of thought when script is being generated */}
            {isCreatePage &&
              factExtraction.isGeneratingScript &&
              factExtraction.confirmedFacts &&
              factExtraction.confirmedFacts.length > 0 && (
                <Message from="assistant">
                  <MessageContent>
                    <ScriptGenerationChainOfThought isVisible={true} />
                  </MessageContent>
                </Message>
              )}
            {/* Hide streaming message on create page during fact extraction - loading state shown in main content */}
            {status === "streaming" &&
              !(isCreatePage && !factExtraction.confirmedFacts) &&
              !(isCreatePage && factExtraction.isGeneratingScript) && (
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse>Generating response...</MessageResponse>
                  </MessageContent>
                </Message>
              )}
            {error && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{`Error: ${error.message}`}</MessageResponse>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput
          onSubmit={handleSubmit}
          accept={isCreatePage ? ".pdf,application/pdf" : undefined}
        >
          <PromptInputBody>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
            <PromptInputTextarea
              placeholder={
                isCreatePage
                  ? "Paste text, upload a PDF, or enter a URL..."
                  : "Ask anything about creating lesson plans..."
              }
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </ChatMessageProvider>
  );
}
