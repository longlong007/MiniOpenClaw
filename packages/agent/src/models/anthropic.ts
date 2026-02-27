import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter, ModelMessage, ModelStreamEvent, ToolDefinition } from "./types.js";

// ─── Anthropic adapter ─────────────────────────────────────────────────────────

export class AnthropicAdapter implements ModelAdapter {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async stream(options: {
    messages: ModelMessage[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    model?: string;
    maxTokens?: number;
    onEvent: (event: ModelStreamEvent) => void;
  }): Promise<void> {
    const model = options.model?.replace("anthropic/", "") ?? "claude-opus-4-6";
    const maxTokens = options.maxTokens ?? 8192;

    const anthropicMessages = options.messages
      .filter((m) => m.role !== "tool" || typeof m.content === "string")
      .map((m) => {
        if (m.role === "tool") {
          return {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: m.toolCallId ?? "",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              },
            ],
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string"
            ? m.content
            : m.content.map((block) => {
                if (block.type === "text") return { type: "text" as const, text: block.text };
                if (block.type === "tool_use") {
                  return {
                    type: "tool_use" as const,
                    id: block.id,
                    name: block.name,
                    input: block.input,
                  };
                }
                return { type: "text" as const, text: "" };
              }),
        };
      });

    const anthropicTools: Anthropic.Tool[] = (options.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        ...(t.inputSchema as { properties?: Record<string, unknown>; required?: string[] }),
      },
    }));

    const streamParams: Anthropic.MessageStreamParams = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    };

    const stream = this.client.messages.stream(streamParams);

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          options.onEvent({ type: "delta", delta: event.delta.text });
        } else if (event.delta.type === "input_json_delta") {
          // tool input streaming — accumulate but don't emit yet
        }
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          options.onEvent({
            type: "tool_call",
            toolCallId: event.content_block.id,
            toolName: event.content_block.name,
          });
        }
      } else if (event.type === "message_delta") {
        if (event.usage) {
          options.onEvent({
            type: "done",
            usage: {
              inputTokens: 0,
              outputTokens: event.usage.output_tokens,
            },
          });
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    const usage = finalMessage.usage;
    options.onEvent({
      type: "done",
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      },
    });
  }
}
