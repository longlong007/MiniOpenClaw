import OpenAI from "openai";
import type { ModelAdapter, ModelMessage, ModelStreamEvent, ToolDefinition } from "./types.js";

// ─── ZhipuAI (智谱 GLM) adapter ───────────────────────────────────────────────
// ZhipuAI is OpenAI-API-compatible. Docs: https://open.bigmodel.cn/dev/api
// Available models: glm-4, glm-4-flash (free), glm-4-air, glm-4-airx,
//                   glm-4-long, glm-z1-flash (reasoning, free), glm-z1-air

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export class ZhipuAdapter implements ModelAdapter {
  name = "zhipu";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.ZHIPU_API_KEY ?? "",
      baseURL: ZHIPU_BASE_URL,
    });
  }

  async stream(options: {
    messages: ModelMessage[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    model?: string;
    maxTokens?: number;
    onEvent: (event: ModelStreamEvent) => void;
  }): Promise<void> {
    // Strip provider prefix: "zhipu/glm-4-flash" → "glm-4-flash"
    const model = options.model?.replace("zhipu/", "") ?? "glm-4-flash";

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      openaiMessages.push({ role: "system", content: options.systemPrompt });
    }

    for (const m of options.messages) {
      if (m.role === "tool") {
        openaiMessages.push({
          role: "tool",
          tool_call_id: m.toolCallId ?? "",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        });
      } else {
        openaiMessages.push({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        });
      }
    }

    const openaiTools: OpenAI.ChatCompletionTool[] = (options.tools ?? []).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      messages: openaiMessages,
      ...(openaiTools.length > 0 ? { tools: openaiTools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    });

    const toolCallAccumulators = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta.content) {
        options.onEvent({ type: "delta", delta: choice.delta.content });
      }

      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulators.has(idx)) {
            toolCallAccumulators.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              args: "",
            });
            options.onEvent({
              type: "tool_call",
              toolCallId: tc.id,
              toolName: tc.function?.name,
            });
          }
          const acc = toolCallAccumulators.get(idx)!;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }

      if (chunk.usage) {
        options.onEvent({
          type: "done",
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          },
        });
      }

      if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
        options.onEvent({ type: "done" });
      }
    }
  }
}
