import type { WebSocket } from "ws";
import type { WsEvent, WsResponse } from "@mini-openclaw/core";

export interface GatewayClient {
  id: string;
  ws: WebSocket;
  connectedAt: number;
  authenticated: boolean;
}

// ─── Client Manager ────────────────────────────────────────────────────────────

export class ClientManager {
  private clients = new Map<string, GatewayClient>();
  private seqCounter = 0;

  add(client: GatewayClient): void {
    this.clients.set(client.id, client);
  }

  remove(clientId: string): void {
    this.clients.delete(clientId);
  }

  get(clientId: string): GatewayClient | undefined {
    return this.clients.get(clientId);
  }

  list(): GatewayClient[] {
    return Array.from(this.clients.values());
  }

  count(): number {
    return this.clients.size;
  }

  send(clientId: string, frame: WsResponse | WsEvent): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1 /* OPEN */) {
      client.ws.send(JSON.stringify(frame));
    }
  }

  broadcast(frame: WsEvent): void {
    const seq = ++this.seqCounter;
    const withSeq = { ...frame, seq };
    for (const client of this.clients.values()) {
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(withSeq));
      }
    }
  }

  sendResponse(
    clientId: string,
    id: string,
    ok: boolean,
    payload?: unknown,
    error?: string
  ): void {
    this.send(clientId, {
      type: "res",
      id,
      ok,
      payload,
      error,
    });
  }

  sendEvent(clientId: string, event: string, payload?: unknown): void {
    const seq = ++this.seqCounter;
    this.send(clientId, {
      type: "event",
      event,
      payload,
      seq,
    });
  }
}
