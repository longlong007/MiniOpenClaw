import { z } from "zod";

// ─── Wire frame types ──────────────────────────────────────────────────────────

export const WsRequestSchema = z.object({
  type: z.literal("req"),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const WsResponseSchema = z.object({
  type: z.literal("res"),
  id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

export const WsEventSchema = z.object({
  type: z.literal("event"),
  event: z.string(),
  payload: z.unknown().optional(),
  seq: z.number().optional(),
});

export const WsFrameSchema = z.discriminatedUnion("type", [
  WsRequestSchema,
  WsResponseSchema,
  WsEventSchema,
]);

export type WsRequest = z.infer<typeof WsRequestSchema>;
export type WsResponse = z.infer<typeof WsResponseSchema>;
export type WsEvent = z.infer<typeof WsEventSchema>;
export type WsFrame = z.infer<typeof WsFrameSchema>;

// ─── Connect params ────────────────────────────────────────────────────────────

export const ConnectParamsSchema = z.object({
  auth: z
    .object({
      token: z.string().optional(),
    })
    .optional(),
  clientId: z.string().optional(),
  version: z.string().optional(),
});

export type ConnectParams = z.infer<typeof ConnectParamsSchema>;

// ─── Agent run params/events ───────────────────────────────────────────────────

export const AgentRunParamsSchema = z.object({
  message: z.string(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: z.enum(["off", "low", "medium", "high"]).optional(),
  stream: z.boolean().optional().default(true),
});

export type AgentRunParams = z.infer<typeof AgentRunParamsSchema>;

export const AgentStreamEventSchema = z.object({
  runId: z.string(),
  type: z.enum(["delta", "tool_call", "tool_result", "done", "error"]),
  delta: z.string().optional(),
  toolName: z.string().optional(),
  toolInput: z.unknown().optional(),
  toolResult: z.unknown().optional(),
  error: z.string().optional(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    })
    .optional(),
});

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

// ─── Send params ───────────────────────────────────────────────────────────────

export const SendParamsSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  channel: z.string().optional(),
});

export type SendParams = z.infer<typeof SendParamsSchema>;
