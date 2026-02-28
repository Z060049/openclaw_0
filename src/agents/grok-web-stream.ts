import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
} from "@mariozechner/pi-ai";
import {
  GrokWebClientBrowser,
  type GrokWebClientOptions,
} from "../providers/grok-web-client-browser.js";
import { stripForWebProvider } from "./prompt-sanitize.js";

const conversationMap = new Map<string, string>();
const parentResponseMap = new Map<string, string>();

export function createGrokWebStreamFn(cookieOrJson: string): StreamFn {
  let options: GrokWebClientOptions;
  try {
    const parsed = JSON.parse(cookieOrJson);
    options = typeof parsed === "string" ? { cookie: parsed, userAgent: "Mozilla/5.0" } : parsed;
  } catch {
    options = { cookie: cookieOrJson, userAgent: "Mozilla/5.0" };
  }
  const client = new GrokWebClientBrowser(options);

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const sessionKey = (context as unknown as { sessionId?: string }).sessionId || "default";
        let conversationId = conversationMap.get(sessionKey);

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
          throw new Error("No message found to send to Grok API");
        }

        const cleanPrompt = stripForWebProvider(prompt);
        if (!cleanPrompt) {
          throw new Error("No message content to send after stripping metadata");
        }

        const parentResponseId = parentResponseMap.get(sessionKey);

        console.log(`[GrokWebStream] Starting run for session: ${sessionKey}`);
        console.log(`[GrokWebStream] Conversation ID: ${conversationId || "new"}`);
        console.log(`[GrokWebStream] Prompt length: ${prompt.length} -> ${cleanPrompt.length} after stripping`);

        const responseStream = await client.chatCompletions({
          conversationId,
          parentResponseId,
          message: cleanPrompt,
          model: model.id,
          signal: streamOptions?.signal,
        });

        if (!responseStream) {
          throw new Error("Grok API returned empty response body");
        }

        const reader = responseStream.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let buffer = "";

        const contentParts: TextContent[] = [];
        let contentIndex = 0;

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
          if (!line || !line.trim()) return;

          let dataStr = line.trim();
          if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
          if (dataStr === "[DONE]" || !dataStr) return;

          try {
            const data = JSON.parse(dataStr);

            const res = data.result ?? data;

            if (client.lastConversationId) {
              conversationMap.set(sessionKey, client.lastConversationId);
            }
            if (res?.responseId) {
              parentResponseMap.set(sessionKey, res.responseId);
            }

            if (res?.userResponse?.sender === "human") return;

            let delta =
              res?.contentDelta ??
              res?.textDelta ??
              res?.content ??
              res?.text ??
              res?.markdown ??
              res?.accumulatedMarkdown ??
              data.text ??
              data.content ??
              data.delta ??
              data.choices?.[0]?.delta?.content;
            if (typeof res?.assistantResponse === "string") delta ??= res.assistantResponse;
            if (typeof res?.assistantMessage === "string") delta ??= res.assistantMessage;
            if (typeof delta === "string" && delta) {
              if (contentParts.length === 0) {
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
          } catch {
            // Ignore parse errors
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
          const combined = buffer + chunk;
          const parts = combined.split("\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            processLine(part.trim());
          }
        }

        console.log(`[GrokWebStream] Stream completed. Content length: ${accumulatedContent.length}`);

        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: contentParts.length > 0 ? contentParts : [{ type: "text", text: accumulatedContent }],
          stopReason: "stop",
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
