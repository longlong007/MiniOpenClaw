import {
  WsFrameSchema,
  ConnectParamsSchema,
  AgentRunParamsSchema,
  SendParamsSchema,
  type WsRequest,
} from "@mini-openclaw/core";
import type { ClientManager } from "./client-manager.js";
import type { SessionStore } from "./session-store.js";
import type { AgentRunner } from "./agent-runner.js";
import type { Config } from "@mini-openclaw/core";

// ─── Router ────────────────────────────────────────────────────────────────────

export class Router {
  constructor(
    private clients: ClientManager,
    private sessions: SessionStore,
    private agentRunner: AgentRunner,
    private config: Config
  ) {}

  async handle(clientId: string, rawMessage: string): Promise<void> {
    let frame: unknown;
    try {
      frame = JSON.parse(rawMessage);
    } catch {
      this.clients.sendResponse(clientId, "?", false, undefined, "Invalid JSON");
      return;
    }

    const parsed = WsFrameSchema.safeParse(frame);
    if (!parsed.success) {
      this.clients.sendResponse(clientId, "?", false, undefined, "Invalid frame");
      return;
    }

    if (parsed.data.type !== "req") return;
    const req = parsed.data as WsRequest;

    const client = this.clients.get(clientId);
    if (!client) return;

    // First frame must be connect
    if (!client.authenticated && req.method !== "connect") {
      this.clients.sendResponse(clientId, req.id, false, undefined, "Not authenticated");
      return;
    }

    switch (req.method) {
      case "connect":
        await this.handleConnect(clientId, req);
        break;
      case "health":
        await this.handleHealth(clientId, req);
        break;
      case "agent":
        await this.handleAgent(clientId, req);
        break;
      case "send":
        await this.handleSend(clientId, req);
        break;
      case "sessions.list":
        await this.handleSessionsList(clientId, req);
        break;
      case "sessions.history":
        await this.handleSessionsHistory(clientId, req);
        break;
      case "sessions.reset":
        await this.handleSessionsReset(clientId, req);
        break;
      case "pairing.list":
        await this.handlePairingList(clientId, req);
        break;
      case "pairing.approve":
        await this.handlePairingApprove(clientId, req);
        break;
      default:
        this.clients.sendResponse(clientId, req.id, false, undefined, `Unknown method: ${req.method}`);
    }
  }

  private async handleConnect(clientId: string, req: WsRequest): Promise<void> {
    const params = ConnectParamsSchema.safeParse(req.params ?? {});
    if (!params.success) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "Invalid connect params");
      return;
    }

    // Token auth
    const gatewayToken = this.config.gateway.token;
    if (gatewayToken) {
      const provided = params.data.auth?.token;
      if (provided !== gatewayToken) {
        this.clients.sendResponse(clientId, req.id, false, undefined, "Invalid token");
        return;
      }
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.authenticated = true;
    }

    this.clients.sendResponse(clientId, req.id, true, {
      hello: "ok",
      health: { status: "ok", clients: this.clients.count() },
      version: "0.1.0",
    });

    this.clients.sendEvent(clientId, "presence", {
      clients: this.clients.count(),
    });
  }

  private async handleHealth(clientId: string, req: WsRequest): Promise<void> {
    this.clients.sendResponse(clientId, req.id, true, {
      status: "ok",
      clients: this.clients.count(),
      sessions: this.sessions.list().length,
      uptime: process.uptime(),
    });
  }

  private async handleAgent(clientId: string, req: WsRequest): Promise<void> {
    const params = AgentRunParamsSchema.safeParse(req.params);
    if (!params.success) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "Invalid agent params");
      return;
    }

    const runId = crypto.randomUUID();
    this.clients.sendResponse(clientId, req.id, true, {
      runId,
      status: "accepted",
    });

    // Run agent, stream events back to client
    try {
      await this.agentRunner.run({
        ...params.data,
        runId,
        onEvent: (event) => {
          this.clients.sendEvent(clientId, "agent", event);
        },
      });
    } catch (err) {
      this.clients.sendEvent(clientId, "agent", {
        runId,
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSend(clientId: string, req: WsRequest): Promise<void> {
    const params = SendParamsSchema.safeParse(req.params);
    if (!params.success) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "Invalid send params");
      return;
    }

    this.sessions.addMessage(params.data.sessionId, "user", params.data.message);
    this.clients.sendResponse(clientId, req.id, true, { ok: true });
  }

  private async handleSessionsList(clientId: string, req: WsRequest): Promise<void> {
    const sessions = this.sessions.list().map((s) => ({
      id: s.id,
      name: s.name,
      channel: s.channel,
      messageCount: s.messages.length,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    }));
    this.clients.sendResponse(clientId, req.id, true, { sessions });
  }

  private async handleSessionsHistory(clientId: string, req: WsRequest): Promise<void> {
    const { sessionId, limit } = (req.params as { sessionId?: string; limit?: number }) ?? {};
    if (!sessionId) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "sessionId required");
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "Session not found");
      return;
    }
    const messages = limit ? session.messages.slice(-limit) : session.messages;
    this.clients.sendResponse(clientId, req.id, true, { messages });
  }

  private async handleSessionsReset(clientId: string, req: WsRequest): Promise<void> {
    const { sessionId } = (req.params as { sessionId?: string }) ?? {};
    if (!sessionId) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "sessionId required");
      return;
    }
    this.sessions.reset(sessionId);
    this.clients.sendResponse(clientId, req.id, true, { ok: true });
  }

  private async handlePairingList(clientId: string, req: WsRequest): Promise<void> {
    const entries = this.sessions.listPairing();
    this.clients.sendResponse(clientId, req.id, true, { entries });
  }

  private async handlePairingApprove(clientId: string, req: WsRequest): Promise<void> {
    const { channel, userId } = (req.params as { channel?: string; userId?: string }) ?? {};
    if (!channel || !userId) {
      this.clients.sendResponse(clientId, req.id, false, undefined, "channel and userId required");
      return;
    }
    const ok = this.sessions.approvePairing(channel, userId);
    this.clients.sendResponse(clientId, req.id, ok, { ok });
  }
}
