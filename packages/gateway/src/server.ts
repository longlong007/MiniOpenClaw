import express from "express";
import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Config } from "@mini-openclaw/core";
import { ClientManager } from "./client-manager.js";
import { SessionStore } from "./session-store.js";
import { Router } from "./router.js";
import type { AgentRunner } from "./agent-runner.js";
import { StubAgentRunner } from "./agent-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Gateway Server ────────────────────────────────────────────────────────────

export interface GatewayServerOptions {
  config: Config;
  agentRunner?: AgentRunner;
  channelRouters?: ChannelRouter[];
}

export interface ChannelRouter {
  name: string;
  /** Mount express routes for this channel (e.g. webhooks) */
  mount(app: express.Express, sessions: SessionStore): void;
}

export class GatewayServer {
  private app: express.Express;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: ClientManager;
  private sessions: SessionStore;
  private router: Router;

  constructor(private options: GatewayServerOptions) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.clients = new ClientManager();
    this.sessions = new SessionStore();
    const runner = options.agentRunner ?? new StubAgentRunner();
    this.router = new Router(this.clients, this.sessions, runner, options.config);

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupExpress();
    this.setupWebSocket();
  }

  getSessionStore(): SessionStore {
    return this.sessions;
  }

  private setupExpress(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Serve WebChat UI
    const uiDir = join(__dirname, "..", "..", "..", "ui");
    this.app.use("/", express.static(uiDir));

    // Health endpoint
    this.app.get("/__openclaw__/health", (_req, res) => {
      res.json({
        status: "ok",
        clients: this.clients.count(),
        sessions: this.sessions.list().length,
        uptime: process.uptime(),
        version: "0.1.0",
      });
    });

    // Sessions REST API
    this.app.get("/__openclaw__/sessions", (_req, res) => {
      res.json({ sessions: this.sessions.list() });
    });

    this.app.get("/__openclaw__/sessions/:id", (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session);
    });

    // Pairing API
    this.app.post("/__openclaw__/pairing/approve", (req, res) => {
      const { channel, userId } = req.body as { channel?: string; userId?: string };
      if (!channel || !userId) {
        res.status(400).json({ error: "channel and userId required" });
        return;
      }
      const ok = this.sessions.approvePairing(channel, userId);
      res.json({ ok });
    });

    this.app.get("/__openclaw__/pairing", (_req, res) => {
      res.json({ entries: this.sessions.listPairing() });
    });

    // Mount channel-specific routes
    for (const ch of this.options.channelRouters ?? []) {
      ch.mount(this.app, this.sessions);
    }
  }

  private setupWebSocket(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = crypto.randomUUID();
      this.clients.add({ id: clientId, ws, connectedAt: Date.now(), authenticated: false });

      ws.on("message", (data) => {
        void this.router.handle(clientId, data.toString());
      });

      ws.on("close", () => {
        this.clients.remove(clientId);
        this.clients.broadcast({ type: "event", event: "presence", payload: { clients: this.clients.count() } });
      });

      ws.on("error", (err) => {
        console.error(`[gateway] WebSocket error for ${clientId}:`, err.message);
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const { port, bind } = this.options.config.gateway;
      const host = bind === "all" ? "0.0.0.0" : "127.0.0.1";
      this.httpServer.listen(port, host, () => {
        console.log(`[gateway] Listening on ws://${host}:${port}`);
        console.log(`[gateway] WebChat: http://${host}:${port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close();
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
