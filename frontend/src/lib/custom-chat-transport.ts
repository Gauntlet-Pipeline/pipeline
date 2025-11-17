import { DefaultChatTransport } from "ai";
import type { UIMessage, ChatRequestOptions, UIMessageChunk } from "ai";

/**
 * Custom chat transport that includes sessionId in the request body
 * and extracts sessionId from response headers
 */
export class CustomChatTransport extends DefaultChatTransport<UIMessage> {
  private sessionId?: string;
  private onSessionCreated?: (sessionId: string) => void;

  constructor(config: {
    api: string;
    sessionId?: string;
    onSessionCreated?: (sessionId: string) => void;
  }) {
    super({ api: config.api });
    this.sessionId = config.sessionId;
    this.onSessionCreated = config.onSessionCreated;
  }

  setSessionId(sessionId: string | undefined) {
    this.sessionId = sessionId;
  }

  setOnSessionCreated(callback: (sessionId: string) => void) {
    this.onSessionCreated = callback;
  }

  async sendMessages(
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: UIMessage[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    console.log("[CustomTransport] sendMessages called", {
      trigger: options.trigger,
      messagesCount: options.messages.length,
      sessionId: this.sessionId,
    });

    // Merge sessionId into the data field if available, or modify the request
    const modifiedOptions = {
      ...options,
      ...(this.sessionId
        ? {
            data: {
              ...((options as { data?: Record<string, unknown> }).data ?? {}),
              sessionId: this.sessionId,
            },
          }
        : {}),
    };

    // Call parent's sendMessages but we need to intercept the fetch
    // Since we can't easily intercept, we'll use a custom fetch
    const originalFetch = globalThis.fetch;
    const sessionIdToSend = this.sessionId;
    const onSessionCreated = this.onSessionCreated;

    // Temporarily override fetch to add sessionId to body and extract sessionId from response
    globalThis.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      // Modify request body BEFORE sending
      if (
        typeof input === "string" &&
        input.includes("/api/chat") &&
        init?.method === "POST" &&
        init?.body
      ) {
        try {
          const body = JSON.parse(init.body as string) as {
            messages?: UIMessage[];
            sessionId?: string;
          };
          body.sessionId = sessionIdToSend;
          init.body = JSON.stringify(body);
          console.log("[CustomTransport] Modified request body", {
            sessionId: body.sessionId,
            messagesCount: body.messages?.length,
          });
        } catch (error) {
          console.error("[CustomTransport] Error modifying body:", error);
        }
      }

      // Make the actual fetch
      const response = await originalFetch(input, init);

      // Extract sessionId from response header
      if (
        typeof input === "string" &&
        input.includes("/api/chat") &&
        init?.method === "POST"
      ) {
        const responseSessionId = response.headers.get("X-Session-Id");
        if (responseSessionId && onSessionCreated) {
          console.log(
            "[CustomTransport] Session ID received from server:",
            responseSessionId,
          );
          onSessionCreated(responseSessionId);
        }
      }

      return response;
    };

    try {
      const stream = await super.sendMessages(modifiedOptions);
      console.log("[CustomTransport] Stream received from server");
      return stream;
    } finally {
      // Restore original fetch
      globalThis.fetch = originalFetch;
    }
  }

  async reconnectToStream(
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Delegate to parent class for reconnection
    return super.reconnectToStream(options);
  }
}
