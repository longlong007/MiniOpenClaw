import type { AgentRunner, AgentRunOptions } from "@mini-openclaw/gateway";
import type { ModelAdapter, ModelMessage, ToolDefinition } from "./models/types.js";
import { AnthropicAdapter } from "./models/anthropic.js";
import { OpenAIAdapter } from "./models/openai.js";
import { DeepSeekAdapter } from "./models/deepseek.js";
import { BrowserTool, browserToolDefinition, type BrowserToolInput } from "./tools/browser.js";
import { SkillsLoader } from "./skills-loader.js";
import type { SessionStore } from "@mini-openclaw/gateway";
import type { AgentConfig } from "@mini-openclaw/core";

// ─── Agent Runner implementation ───────────────────────────────────────────────

export class AgentRunnerImpl implements AgentRunner {
  private adapter: ModelAdapter;
  private browserTool: BrowserTool;
  private skillsLoader: SkillsLoader;

  constructor(
    private config: AgentConfig,
    private sessions: SessionStore
  ) {
    this.adapter = this.createAdapter();
    this.browserTool = new BrowserTool();
    this.skillsLoader = new SkillsLoader(
      config.skillsDir ? [config.skillsDir] : undefined
    );
  }

  private createAdapter(): ModelAdapter {
    const model = this.config.model ?? "";
    const keys = this.config.apiKeys ?? {};
    const env = process.env;

    // Resolve per-provider API keys: config.apiKeys first, then env vars as fallback
    const anthropicKey = keys.anthropic ?? env.ANTHROPIC_API_KEY;
    const openaiKey = keys.openai ?? env.OPENAI_API_KEY;
    const deepseekKey = keys.deepseek ?? env.DEEPSEEK_API_KEY;

    // Explicit provider prefix always wins
    if (model.startsWith("deepseek/")) return new DeepSeekAdapter(deepseekKey);
    if (model.startsWith("openai/")) return new OpenAIAdapter(openaiKey);
    if (model.startsWith("anthropic/")) return new AnthropicAdapter(anthropicKey);

    // No prefix — auto-detect from available API keys (priority: anthropic > openai > deepseek)
    if (deepseekKey && !anthropicKey && !openaiKey) return new DeepSeekAdapter(deepseekKey);
    if (openaiKey && !anthropicKey) return new OpenAIAdapter(openaiKey);
    return new AnthropicAdapter(anthropicKey);
  }

  async run(options: AgentRunOptions): Promise<void> {
    const { runId, message, sessionId, onEvent } = options;

    // Get or create session
    const session = this.sessions.getOrCreate(sessionId);

    // Add user message to session
    this.sessions.addMessage(session.id, "user", message);

    // Build conversation history for model
    const modelMessages: ModelMessage[] = session.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Build tools list
    const tools: ToolDefinition[] = [];
    if (this.config.browserEnabled) {
      tools.push(browserToolDefinition);
    }

    // Build system prompt
    const skills = this.skillsLoader.load();
    const skillsAppendix = this.skillsLoader.buildSystemPromptAppendix(skills);
    const systemPrompt = `You are a helpful personal AI assistant (Mini OpenClaw). You are concise, accurate, and proactive.${skillsAppendix}`;

    // Agentic loop (tool calling)
    let loopMessages = [...modelMessages];
    let fullResponse = "";
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      iterations++;
      let pendingToolCallId: string | undefined;
      let pendingToolName: string | undefined;
      let responseText = "";
      let isDone = false;

      await this.adapter.stream({
        messages: loopMessages,
        systemPrompt,
        tools,
        model: options.model ?? this.config.model,
        maxTokens: this.config.maxTokens,
        onEvent: (event) => {
          if (event.type === "delta" && event.delta) {
            responseText += event.delta;
            fullResponse += event.delta;
            onEvent({ runId, type: "delta", delta: event.delta });
          } else if (event.type === "tool_call") {
            pendingToolCallId = event.toolCallId;
            pendingToolName = event.toolName;
            onEvent({
              runId,
              type: "tool_call",
              toolName: event.toolName,
              toolInput: event.toolInput,
            });
          } else if (event.type === "done") {
            isDone = true;
            if (event.usage) {
              onEvent({ runId, type: "done", usage: event.usage });
            }
          }
        },
      });

      // If no tool call, we're done
      if (!pendingToolCallId || !pendingToolName) {
        // Save assistant response
        if (responseText) {
          this.sessions.addMessage(session.id, "assistant", responseText);
        }
        break;
      }

      // Execute tool
      let toolResult = "";
      try {
        if (pendingToolName === "browser") {
          toolResult = await this.browserTool.execute({} as BrowserToolInput);
        } else {
          toolResult = `Unknown tool: ${pendingToolName}`;
        }
      } catch (err) {
        toolResult = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
      }

      onEvent({ runId, type: "tool_result", toolResult });

      // Add assistant + tool result to loop messages
      loopMessages.push({ role: "assistant", content: responseText });
      loopMessages.push({
        role: "tool",
        content: toolResult,
        toolCallId: pendingToolCallId,
        toolName: pendingToolName,
      });

      if (isDone) break;
    }

    onEvent({ runId, type: "done" });
  }
}
