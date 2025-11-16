"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage, FileUIPart } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAttachments,
  MessageAttachment,
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
import { BookOpen, GraduationCap, Sparkles } from "lucide-react";

const PROMPTS = [
  {
    icon: BookOpen,
    text: "Create a lesson plan",
    prompt:
      "Create a lesson plan for [subject] covering [topic] for [grade level] students.",
  },
  {
    icon: GraduationCap,
    text: "Best activities for grade level",
    prompt:
      "What activities work best for [grade level] students learning [subject]?",
  },
  {
    icon: Sparkles,
    text: "Make topic engaging",
    prompt: "How can I make [topic] more engaging for my students?",
  },
];

export function ChatPreview() {
  // Use AI SDK's useChat hook for chat state management
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onFinish: (event) => {
      console.log(event.message);
    },
  });

  // Handle PromptInput submit with text and file attachments
  const handleSubmit = async (
    message: PromptInputMessage,
    _event: React.FormEvent<HTMLFormElement>,
  ) => {
    if (!message.text.trim() && message.files.length === 0) return;

    // Build message parts array
    const parts: Array<{ type: "text"; text: string } | FileUIPart> = [];

    if (message.text.trim()) {
      parts.push({ type: "text", text: message.text.trim() });
    }

    // Add file parts
    message.files.forEach((file) => {
      parts.push(file);
    });

    // Use sendMessage to add the user message and trigger the API call
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
    <div className="flex h-full flex-col px-2 py-4">
      <Conversation className="mb-4">
        <ConversationContent>
          {messages.length === 0 && (
            <>
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>
                    Hello, I&apos;m your creative assistant. I can help you
                    create lesson plans, suggest activities, and make topics
                    more engaging for your students. What would you like to
                    create?
                  </MessageResponse>
                </MessageContent>
              </Message>
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
            </>
          )}
          {messages.map((message: UIMessage, index: number) => {
            // Extract text and file parts from message
            const textPart = message.parts?.find(
              (part): part is { type: "text"; text: string } =>
                part.type === "text",
            );
            const fileParts =
              message.parts?.filter(
                (part): part is FileUIPart => part.type === "file",
              ) ?? [];

            const content = textPart?.text ?? "";

            return (
              <Message key={message.id ?? index} from={message.role}>
                {fileParts.length > 0 && (
                  <MessageAttachments>
                    {fileParts.map((file, fileIndex) => (
                      <MessageAttachment key={fileIndex} data={file} />
                    ))}
                  </MessageAttachments>
                )}
                {content && (
                  <MessageContent>
                    <MessageResponse>{content}</MessageResponse>
                  </MessageContent>
                )}
              </Message>
            );
          })}
          {status === "streaming" && (
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

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea placeholder="Ask anything about creating lesson plans..." />
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
  );
}
