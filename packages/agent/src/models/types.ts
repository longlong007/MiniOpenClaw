// ─── Model adapter types ───────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelMessage {
  role: "user" | "assistant" | "tool";
  content: string | ModelContentBlock[];
  toolCallId?: string;
  toolName?: string;
}

export type ModelContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; toolUseId: string; content: string };

export interface ModelStreamEvent {
  type: "delta" | "tool_call" | "done" | "error";
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelAdapter {
  name: string;
  stream(options: {
    messages: ModelMessage[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    model?: string;
    maxTokens?: number;
    onEvent: (event: ModelStreamEvent) => void;
  }): Promise<void>;
}
