import { z } from "zod";

// ─── Message schema ────────────────────────────────────────────────────────────

export const MessageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.number(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  channel: z.string().optional(),
  channelUserId: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ─── Session schema ────────────────────────────────────────────────────────────

export const SessionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  messages: z.array(MessageSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
  model: z.string().optional(),
  channel: z.string().optional(),
  channelUserId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ─── Pairing store schema ──────────────────────────────────────────────────────

export const PairingEntrySchema = z.object({
  userId: z.string(),
  channel: z.string(),
  approved: z.boolean().default(false),
  pairingCode: z.string().optional(),
  createdAt: z.number(),
  approvedAt: z.number().optional(),
});

export type PairingEntry = z.infer<typeof PairingEntrySchema>;

// ─── Utility: create message ───────────────────────────────────────────────────

export function createMessage(
  role: MessageRole,
  content: string,
  extra?: Partial<Message>
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

// ─── Utility: create session ───────────────────────────────────────────────────

export function createSession(extra?: Partial<Session>): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}
