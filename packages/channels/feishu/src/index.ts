import * as lark from "@larksuiteoapi/node-sdk";
import type { Express, Request, Response } from "express";
import { createHmac, createDecipheriv } from "crypto";
import type { AgentRunner, SessionStore, ChannelRouter } from "@mini-openclaw/gateway";
import type { FeishuConfig } from "@mini-openclaw/core";

// ─── Feishu Channel ────────────────────────────────────────────────────────────

export class FeishuChannel implements ChannelRouter {
  name = "feishu";
  private larkClient: lark.Client;
  private runningAgents = new Set<string>();

  constructor(
    private config: FeishuConfig,
    private sessions: SessionStore,
    private agentRunner: AgentRunner
  ) {
    this.larkClient = new lark.Client({
      appId: config.appId ?? "",
      appSecret: config.appSecret ?? "",
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  mount(app: Express, _sessions: SessionStore): void {
    app.post("/channels/feishu/webhook", (req: Request, res: Response) => {
      void this.handleWebhook(req, res);
    });
    console.log("[feishu] Webhook mounted at POST /channels/feishu/webhook");
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    const body = req.body as FeishuWebhookBody;

    // URL verification challenge
    if (body.type === "url_verification") {
      res.json({ challenge: body.challenge });
      return;
    }

    // Decrypt if encryptKey is set
    let event = body;
    if (this.config.encryptKey && body.encrypt) {
      try {
        event = decryptFeishu(body.encrypt, this.config.encryptKey) as FeishuWebhookBody;
      } catch {
        res.status(400).json({ error: "decrypt failed" });
        return;
      }
    }

    // Verify token
    if (this.config.verificationToken) {
      const token = event.token ?? event.header?.token;
      if (token !== this.config.verificationToken) {
        res.status(401).json({ error: "invalid token" });
        return;
      }
    }

    // Acknowledge immediately
    res.json({ code: 0 });

    // Process event async
    await this.processEvent(event);
  }

  private async processEvent(event: FeishuWebhookBody): Promise<void> {
    const eventType = event.header?.event_type ?? event.event?.type;

    if (eventType === "im.message.receive_v1" || event.event?.message) {
      await this.handleMessage(event);
    }
  }

  private async handleMessage(body: FeishuWebhookBody): Promise<void> {
    const msg = body.event?.message;
    if (!msg) return;

    // Only handle text messages
    if (msg.message_type !== "text") return;

    // Parse message content
    let text: string;
    try {
      const content = JSON.parse(msg.content ?? "{}") as { text?: string };
      text = content.text ?? "";
    } catch {
      return;
    }

    if (!text.trim()) return;

    const senderId = body.event?.sender?.sender_id?.open_id ?? "";
    const chatId = msg.chat_id ?? "";
    const messageId = msg.message_id ?? "";

    if (!senderId || !chatId) return;

    // Deduplicate
    if (this.runningAgents.has(messageId)) return;
    this.runningAgents.add(messageId);

    try {
      const session = this.sessions.getOrCreateForChannel("feishu", senderId);
      const runId = crypto.randomUUID();
      let responseText = "";

      // Send "thinking" reaction
      await this.sendReaction(messageId, "THINKING_FACE").catch(() => {});

      await this.agentRunner.run({
        runId,
        message: text.trim(),
        sessionId: session.id,
        onEvent: (ev) => {
          if (ev.type === "delta" && ev.delta) {
            responseText += ev.delta;
          }
        },
      });

      if (!responseText) responseText = "(no response)";

      // Reply in same chat
      await this.sendMessage(chatId, responseText, msg.chat_type === "p2p");
    } catch (err) {
      await this.sendMessage(
        chatId,
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
        false
      ).catch(() => {});
    } finally {
      this.runningAgents.delete(messageId);
    }
  }

  private async sendMessage(chatId: string, text: string, _isP2P: boolean): Promise<void> {
    // Split text if > 4000 chars (Feishu limit)
    const chunks = splitText(text, 4000);
    for (const chunk of chunks) {
      await this.larkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk }),
        },
      });
    }
  }

  private async sendReaction(messageId: string, emojiType: string): Promise<void> {
    await this.larkClient.im.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: emojiType } },
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function splitText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  while (text.length > maxLength) {
    chunks.push(text.slice(0, maxLength));
    text = text.slice(maxLength);
  }
  if (text) chunks.push(text);
  return chunks;
}

function decryptFeishu(encrypted: string, key: string): unknown {
  const keyBuffer = createHmac("sha256", "").update(key).digest();
  const encBuf = Buffer.from(encrypted, "base64");
  const iv = encBuf.slice(0, 16);
  const decipher = createDecipheriv("aes-256-cbc", keyBuffer, iv);
  const decrypted = Buffer.concat([decipher.update(encBuf.slice(16)), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

// ─── Feishu webhook body types ─────────────────────────────────────────────────

interface FeishuWebhookBody {
  type?: string;
  challenge?: string;
  token?: string;
  encrypt?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    type?: string;
    sender?: {
      sender_id?: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      sender_type?: string;
    };
    message?: {
      message_id?: string;
      root_id?: string;
      parent_id?: string;
      create_time?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
    };
  };
}
