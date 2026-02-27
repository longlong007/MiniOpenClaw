import { z } from "zod";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Config schema ─────────────────────────────────────────────────────────────

export const ModelConfigSchema = z.object({
  model: z.string().default("anthropic/claude-opus-4-6"),
  maxTokens: z.number().default(8192),
  temperature: z.number().optional(),
});

export const GatewayConfigSchema = z.object({
  port: z.number().default(18789),
  bind: z.enum(["loopback", "all"]).default("loopback"),
  token: z.string().optional(),
  auth: z
    .object({
      mode: z.enum(["none", "token", "password"]).default("none"),
      password: z.string().optional(),
    })
    .default({}),
});

export const DiscordConfigSchema = z.object({
  token: z.string().optional(),
  allowFrom: z.array(z.string()).default([]),
  dmPolicy: z.enum(["open", "pairing"]).default("pairing"),
});

export const FeishuConfigSchema = z.object({
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  verificationToken: z.string().optional(),
  encryptKey: z.string().optional(),
  allowFrom: z.array(z.string()).default([]),
});

export const ChannelsConfigSchema = z.object({
  discord: DiscordConfigSchema.optional(),
  feishu: FeishuConfigSchema.optional(),
});

export const AgentConfigSchema = z.object({
  model: z.string().default("anthropic/claude-opus-4-6"),
  maxTokens: z.number().default(8192),
  workspace: z.string().optional(),
  skillsDir: z.string().optional(),
  browserEnabled: z.boolean().default(false),
  // Per-provider API keys (optional; env vars take priority)
  apiKeys: z
    .object({
      anthropic: z.string().optional(),
      openai: z.string().optional(),
      deepseek: z.string().optional(),
      zhipu: z.string().optional(),
    })
    .optional(),
});

export const ConfigSchema = z.object({
  agent: AgentConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;

// ─── Config file path ──────────────────────────────────────────────────────────

export function getConfigDir(): string {
  return join(homedir(), ".openclaw");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "openclaw.json");
}

// ─── Load config ───────────────────────────────────────────────────────────────

export function loadConfig(): Config {
  const configPath = getConfigPath();
  let raw: unknown = {};

  if (existsSync(configPath)) {
    try {
      raw = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      // ignore parse errors, use defaults
    }
  }

  // Overlay environment variables
  const env = process.env;
  const merged = deepMerge(raw as Record<string, unknown>, {
    agent: {
      // Surface API keys from env into config.agent.apiKeys so adapters can read them
      apiKeys: {
        ...(env.ANTHROPIC_API_KEY ? { anthropic: env.ANTHROPIC_API_KEY } : {}),
        ...(env.OPENAI_API_KEY ? { openai: env.OPENAI_API_KEY } : {}),
        ...(env.DEEPSEEK_API_KEY ? { deepseek: env.DEEPSEEK_API_KEY } : {}),
        ...(env.ZHIPU_API_KEY ? { zhipu: env.ZHIPU_API_KEY } : {}),
      },
      // Auto-select default model from the sole available API key
      ...(env.DEEPSEEK_API_KEY && !env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.ZHIPU_API_KEY
        ? { model: "deepseek/deepseek-chat" }
        : {}),
      ...(env.ZHIPU_API_KEY && !env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.DEEPSEEK_API_KEY
        ? { model: "zhipu/glm-4-flash" }
        : {}),
    },
    gateway: {
      ...(env.OPENCLAW_GATEWAY_PORT
        ? { port: parseInt(env.OPENCLAW_GATEWAY_PORT) }
        : {}),
      ...(env.OPENCLAW_GATEWAY_TOKEN
        ? { token: env.OPENCLAW_GATEWAY_TOKEN }
        : {}),
    },
    channels: {
      discord: {
        ...(env.DISCORD_BOT_TOKEN ? { token: env.DISCORD_BOT_TOKEN } : {}),
      },
      feishu: {
        ...(env.FEISHU_APP_ID ? { appId: env.FEISHU_APP_ID } : {}),
        ...(env.FEISHU_APP_SECRET ? { appSecret: env.FEISHU_APP_SECRET } : {}),
        ...(env.FEISHU_VERIFICATION_TOKEN
          ? { verificationToken: env.FEISHU_VERIFICATION_TOKEN }
          : {}),
        ...(env.FEISHU_ENCRYPT_KEY
          ? { encryptKey: env.FEISHU_ENCRYPT_KEY }
          : {}),
      },
    },
  });

  return ConfigSchema.parse(merged);
}

// ─── Save config ───────────────────────────────────────────────────────────────

export function saveConfig(config: Config): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

// ─── Deep merge helper ─────────────────────────────────────────────────────────

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>
      );
    } else if (sv !== undefined && sv !== null && sv !== "") {
      result[key] = sv;
    }
  }
  return result;
}
