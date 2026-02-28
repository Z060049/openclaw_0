import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
} from "@mariozechner/pi-ai";
import { ClaudeWebClientBrowser, type ClaudeWebClientOptions } from "../providers/claude-web-client-browser.js";
import { stripForWebProvider } from "./prompt-sanitize.js";

export function createClaudeWebStreamFn(authOrJson: string): StreamFn {
  let options: ClaudeWebClientOptions;
  try {
    options = JSON.parse(authOrJson) as ClaudeWebClientOptions;
  } catch {
    options = { sessionKey: authOrJson };
  }

  const client = new ClaudeWebClientBrowser(options);

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const messages = context.messages || [];
        const lastUserMessage = [...messages].toReversed().find((m) => m.role === "user");

        let prompt = "";
        if (lastUserMessage) {
          if (typeof lastUserMessage.content === "string") {
            prompt = lastUserMessage.content;
          } else if (Array.isArray(lastUserMessage.content)) {
            prompt = (lastUserMessage.content as TextContent[])
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("");
          }
        }

        if (!prompt) {
          throw new Error("No message found to send to Claude");
        }

        const cleanPrompt = stripForWebProvider(prompt);
        if (!cleanPrompt) {
          throw new Error("No message content to send after stripping metadata");
        }

        const responseStream = await client.chatCompletions({
          message: cleanPrompt,
          model: model.id,
          signal: streamOptions?.signal,
        });

        const reader = responseStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        const contentParts: TextContent[] = [];
        let contentIndex = 0;
        let textStarted = false;

        const createPartial = (): AssistantMessage => ({
          role: "assistant",
          content: [...contentParts],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        });

        const processLine = (line: string) => {
          if (!line || !line.startsWith("data: ")) {
            return;
          }

          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]" || !dataStr) {
            return;
          }

          try {
            const data = JSON.parse(dataStr) as any;

            // Handle content_block_delta (new API format)
            if (data.type === "content_block_delta" && data.delta?.text) {
              const delta = data.delta.text;

              if (!textStarted) {
                textStarted = true;
                contentParts[contentIndex] = { type: "text", text: "" };
                stream.push({
                  type: "text_start",
                  contentIndex,
                  partial: createPartial(),
                });
              }

              contentParts[contentIndex].text += delta;
              accumulatedContent += delta;

              stream.push({
                type: "text_delta",
                contentIndex,
                delta,
                partial: createPartial(),
              });
            }
            // Handle completion (old API format)
            else if (data.type === "completion" && data.completion) {
              const delta = data.completion;

              if (!textStarted) {
                textStarted = true;
                contentParts[contentIndex] = { type: "text", text: "" };
                stream.push({
                  type: "text_start",
                  contentIndex,
                  partial: createPartial(),
                });
              }

              contentParts[contentIndex].text += delta;
              accumulatedContent += delta;

              stream.push({
                type: "text_delta",
                contentIndex,
                delta,
                partial: createPartial(),
              });
            } else if (data.type === "error") {
              throw new Error(data.error?.message || "Claude API error");
            } else if (data.type === "message_limit") {
              throw new Error("Message limit reached");
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("Claude API error")) {
              throw e;
            }
            // Ignore JSON parse errors for malformed events
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              processLine(buffer.trim());
            }
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            processLine(line.trim());
          }
        }

        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: contentParts,
          stopReason: "stop",
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: Math.ceil(prompt.length / 4),
            output: Math.ceil(accumulatedContent.length / 4),
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: Math.ceil((prompt.length + accumulatedContent.length) / 4),
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          timestamp: Date.now(),
        };

        stream.push({
          type: "done",
          reason: "stop",
          message: assistantMessage,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        stream.push({
          type: "error",
          reason: "error",
          error: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage,
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
          },
        } as any);
      } finally {
        stream.end();
      }
    };

    queueMicrotask(() => void run());
    return stream;
  };
}
