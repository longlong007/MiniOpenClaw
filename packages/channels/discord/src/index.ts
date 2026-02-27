import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message as DiscordMessage,
} from "discord.js";
import type { AgentRunner } from "@mini-openclaw/gateway";
import type { SessionStore } from "@mini-openclaw/gateway";
import type { DiscordConfig } from "@mini-openclaw/core";

// ─── Discord Channel ───────────────────────────────────────────────────────────

export class DiscordChannel {
  private client: Client;
  private runningAgents = new Set<string>();

  constructor(
    private config: DiscordConfig,
    private sessions: SessionStore,
    private agentRunner: AgentRunner
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.client.once("ready", () => {
      console.log(`[discord] Logged in as ${this.client.user?.tag}`);
    });

    this.client.on("messageCreate", async (msg) => {
      await this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    if (msg.author.bot) return;

    const isDM = !msg.guild;
    const isMentioned = msg.mentions.has(this.client.user!);

    // Only respond to DMs or @mentions
    if (!isDM && !isMentioned) return;

    const userId = msg.author.id;
    const channel = "discord";

    // DM policy: pairing
    if (this.config.dmPolicy === "pairing") {
      const isApproved = this.sessions.isApproved(channel, userId);
      if (!isApproved) {
        const pairing = this.sessions.getPairing(channel, userId);
        if (!pairing) {
          const entry = this.sessions.createPairing(channel, userId);
          await msg.reply(
            `🦞 Hello! To use this assistant, you need to be approved.\n` +
            `Your pairing code is: **${entry.pairingCode}**\n` +
            `Ask the admin to run: \`openclaw pairing approve discord ${userId}\``
          );
          return;
        }
        await msg.reply(
          `⏳ Your pairing request is pending approval. Code: **${pairing.pairingCode}**`
        );
        return;
      }
    } else if (this.config.allowFrom.length > 0) {
      if (!this.config.allowFrom.includes(userId) && !this.config.allowFrom.includes("*")) {
        return;
      }
    }

    // Extract message text (remove bot mention)
    let text = msg.content;
    if (isMentioned && this.client.user) {
      text = text.replace(`<@${this.client.user.id}>`, "").trim();
      text = text.replace(`<@!${this.client.user.id}>`, "").trim();
    }
    if (!text) {
      await msg.reply("🦞 How can I help you?");
      return;
    }

    // Prevent duplicate runs
    const runKey = `${userId}:${msg.id}`;
    if (this.runningAgents.has(runKey)) return;
    this.runningAgents.add(runKey);

    // Show typing indicator
    if (msg.channel.isSendable()) {
      await msg.channel.sendTyping().catch(() => {});
    }

    // Get or create session
    const session = this.sessions.getOrCreateForChannel(channel, userId);
    const runId = crypto.randomUUID();
    let responseText = "";

    try {
      await this.agentRunner.run({
        runId,
        message: text,
        sessionId: session.id,
        onEvent: (event) => {
          if (event.type === "delta" && event.delta) {
            responseText += event.delta;
          }
        },
      });

      // Discord message limit is 2000 chars — split if needed
      const chunks = splitMessage(responseText || "_(no response)_", 2000);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
    } catch (err) {
      await msg.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.runningAgents.delete(runKey);
    }
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      console.warn("[discord] No bot token configured — Discord channel disabled");
      return;
    }
    await this.client.login(this.config.token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  while (text.length > maxLength) {
    chunks.push(text.slice(0, maxLength));
    text = text.slice(maxLength);
  }
  if (text) chunks.push(text);
  return chunks;
}
