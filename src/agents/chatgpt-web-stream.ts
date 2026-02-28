import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
} from "@mariozechner/pi-ai";
import {
  ChatGPTWebClientBrowser,
  type ChatGPTWebClientOptions,
} from "../providers/chatgpt-web-client-browser.js";
import { stripForWebProvider } from "./prompt-sanitize.js";

const conversationMap = new Map<string, string>();
const parentMessageMap = new Map<string, string>();

export function createChatGPTWebStreamFn(cookieOrJson: string): StreamFn {
  let options: string | ChatGPTWebClientOptions;
  try {
    const parsed = JSON.parse(cookieOrJson);
    if (typeof parsed === "string") {
      options = { accessToken: parsed };
    } else {
      options = parsed;
    }
  } catch {
    options = { accessToken: cookieOrJson };
  }
  const client = new ChatGPTWebClientBrowser(options);

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const sessionKey = (context as unknown as { sessionId?: string }).sessionId || "default";
        let conversationId = conversationMap.get(sessionKey);
        let parentMessageId = parentMessageMap.get(sessionKey);

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
          throw new Error("No message found to send to ChatGPT API");
        }

        const cleanPrompt = stripForWebProvider(prompt);
        if (!cleanPrompt) {
          throw new Error("No message content to send after stripping metadata");
        }

        console.log(`[ChatGPTWebStream] Starting run for session: ${sessionKey}`);
        console.log(`[ChatGPTWebStream] Conversation ID: ${conversationId || "new"}`);
        console.log(`[ChatGPTWebStream] Prompt length: ${prompt.length} -> ${cleanPrompt.length} after stripping`);

        const responseStream = await client.chatCompletions({
          conversationId: conversationId || "new",
          parentMessageId,
          message: cleanPrompt,
          model: model.id,
          signal: options?.signal,
        });

        if (!responseStream) {
          throw new Error("ChatGPT API returned empty response body");
        }

        const reader = responseStream.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let buffer = "";

        const contentParts: TextContent[] = [];
        let contentIndex = 0;
        let sseEventCount = 0;
        const sseSamples: Array<{ role?: string; hasParts: boolean; contentPreview?: string }> = [];

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
          if (dataStr === "[DONE]") {
            return;
          }
          if (!dataStr) {
            return;
          }

          try {
            const data = JSON.parse(dataStr);

            // Extract conversation and message IDs
            if (data.conversation_id) {
              conversationMap.set(sessionKey, data.conversation_id);
            }
            if (data.message?.id) {
              parentMessageMap.set(sessionKey, data.message.id);
            }

            // 只处理 assistant 的回复，忽略 user 的 echo 等
            const role = data.message?.author?.role ?? data.message?.role;
            if (role && role !== "assistant") {
              if (sseEventCount < 8) {
                console.log(`[ChatGPTWebStream] Skip event (role=${role})`);
              }
              return;
            }

            if (data.message && sseEventCount < 8) {
              sseEventCount++;
              const rawPart = data.message?.content?.parts?.[0];
              const preview =
                typeof rawPart === "string"
                  ? rawPart.slice(0, 100)
                  : typeof rawPart === "object" && rawPart !== null && "text" in rawPart
                    ? String((rawPart as { text?: string }).text).slice(0, 100)
                    : undefined;
              sseSamples.push({
                role: role ?? undefined,
                hasParts: !!(data.message?.content?.parts?.length),
                contentPreview: preview,
              });
            }

            // Extract content: 支持 parts[0] 为字符串或 { type: "text", text: "..." }
            const rawPart = data.message?.content?.parts?.[0];
            const content =
              typeof rawPart === "string"
                ? rawPart
                : typeof rawPart === "object" && rawPart !== null && "text" in rawPart
                  ? (rawPart as { text?: string }).text
                  : undefined;
            if (typeof content === "string" && content) {
              const delta = content.slice(accumulatedContent.length);
              if (delta) {
                if (contentParts.length === 0) {
                  contentParts[contentIndex] = { type: "text", text: "" };
                  stream.push({
                    type: "text_start",
                    contentIndex,
                    partial: createPartial(),
                  });
                }

                contentParts[contentIndex].text += delta;
                accumulatedContent = content;

                stream.push({
                  type: "text_delta",
                  contentIndex,
                  delta,
                  partial: createPartial(),
                });
              }
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

        console.log(`[ChatGPTWebStream] Stream completed. Content length: ${accumulatedContent.length}`);
        if (sseSamples.length > 0) {
          console.log(
            `[ChatGPTWebStream] SSE samples:`,
            JSON.stringify(sseSamples, null, 2).slice(0, 800)
          );
        }

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
