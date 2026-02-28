import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TextContent,
} from "@mariozechner/pi-ai";
import { DoubaoWebClientBrowser, type DoubaoWebClientOptions } from "../providers/doubao-web-client-browser.js";
import { stripForWebProvider } from "./prompt-sanitize.js";

export function createDoubaoWebStreamFn(authOrJson: string): StreamFn {
  let options: DoubaoWebClientOptions;
  try {
    options = JSON.parse(authOrJson) as DoubaoWebClientOptions;
  } catch {
    options = { sessionid: authOrJson, userAgent: "Mozilla/5.0" };
  }

  const client = new DoubaoWebClientBrowser(options);

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        await client.init();

        const messages = context.messages || [];
        const doubaoMessages = messages.map((m) => {
          let content =
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .filter((p) => p.type === "text")
                    .map((p) => (p as TextContent).text)
                    .join("")
                : "";
          if ((m.role as string) === "user" && content) {
            content = stripForWebProvider(content) || content;
          }
          return { role: m.role as string, content };
        });

        const modelId = model.id.includes("/") ? model.id.split("/")[1] : model.id;

        console.log(`[DoubaoWebStream] Starting stream for model: ${modelId}`);
        console.log(`[DoubaoWebStream] Messages count: ${doubaoMessages.length}`);

        const responseStream = await client.chatCompletions({
          messages: doubaoMessages,
          model: modelId,
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
          // 豆包 SSE 格式解析
          // 格式1: data: {"event_type":2001,"event_data":"{...}"}
          // 格式2: id: 123 event: CHUNK_DELTA data: {"text":"..."}
          
          if (!line) return;

          // 处理 data: 前缀
          const dataStr = line.startsWith("data: ") ? line.slice(6).trim() : line.trim();
          if (!dataStr || dataStr === "[DONE]") return;

          try {
            const data = JSON.parse(dataStr) as any;

            // 豆包 samantha API 格式
            if (data.event_type === 2001 && data.event_data) {
              const eventData = JSON.parse(data.event_data) as any;
              if (eventData.message?.content) {
                const content = JSON.parse(eventData.message.content) as any;
                if (content.text) {
                  const delta = content.text;

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
              }
            }
            // 结束标记
            else if (data.event_type === 2003) {
              // 流结束
            }
          } catch (e) {
            // 忽略解析错误
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

        console.log(`[DoubaoWebStream] Stream completed. Content length: ${accumulatedContent.length}`);

        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: contentParts,
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
        console.error(`[DoubaoWebStream] Error: ${errorMessage}`);
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
