import type { AgentStreamEvent } from "@mini-openclaw/core";

// ─── Agent runner interface ────────────────────────────────────────────────────
// The actual implementation lives in packages/agent.
// Gateway only depends on this interface to avoid circular deps.

export interface AgentRunOptions {
  runId: string;
  message: string;
  sessionId?: string;
  model?: string;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  stream?: boolean;
  onEvent: (event: AgentStreamEvent) => void;
}

export interface AgentRunner {
  run(options: AgentRunOptions): Promise<void>;
}

// ─── Stub runner (used when no agent is configured) ────────────────────────────

export class StubAgentRunner implements AgentRunner {
  async run(options: AgentRunOptions): Promise<void> {
    options.onEvent({
      runId: options.runId,
      type: "delta",
      delta: "Agent not configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    });
    options.onEvent({ runId: options.runId, type: "done" });
  }
}
