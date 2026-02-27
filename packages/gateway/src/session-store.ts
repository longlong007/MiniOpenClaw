import {
  type Session,
  type Message,
  createSession,
  createMessage,
  type PairingEntry,
} from "@mini-openclaw/core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Session Store ─────────────────────────────────────────────────────────────

export class SessionStore {
  private sessions = new Map<string, Session>();
  private pairingStore = new Map<string, PairingEntry>();
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".openclaw", "sessions");
    this.ensureDir();
    this.loadFromDisk();
  }

  private ensureDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    const sessionsFile = join(this.dataDir, "sessions.json");
    if (existsSync(sessionsFile)) {
      try {
        const data = JSON.parse(readFileSync(sessionsFile, "utf8")) as {
          sessions?: Session[];
          pairing?: PairingEntry[];
        };
        for (const s of data.sessions ?? []) {
          this.sessions.set(s.id, s);
        }
        for (const p of data.pairing ?? []) {
          this.pairingStore.set(`${p.channel}:${p.userId}`, p);
        }
      } catch {
        // ignore corrupt data
      }
    }
  }

  private saveToDisk(): void {
    const sessionsFile = join(this.dataDir, "sessions.json");
    writeFileSync(
      sessionsFile,
      JSON.stringify(
        {
          sessions: Array.from(this.sessions.values()),
          pairing: Array.from(this.pairingStore.values()),
        },
        null,
        2
      ),
      "utf8"
    );
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(id?: string): Session {
    if (id && this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }
    const session = createSession({ id });
    this.sessions.set(session.id, session);
    this.saveToDisk();
    return session;
  }

  /** Get or create session keyed by channel + userId */
  getOrCreateForChannel(channel: string, userId: string): Session {
    for (const session of this.sessions.values()) {
      if (session.channel === channel && session.channelUserId === userId) {
        return session;
      }
    }
    const session = createSession({
      channel,
      channelUserId: userId,
      name: `${channel}:${userId}`,
    });
    this.sessions.set(session.id, session);
    this.saveToDisk();
    return session;
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }

  addMessage(sessionId: string, role: Message["role"], content: string, extra?: Partial<Message>): Message {
    const session = this.getOrCreate(sessionId);
    const message = createMessage(role, content, extra);
    session.messages.push(message);
    session.updatedAt = Date.now();
    this.saveToDisk();
    return message;
  }

  reset(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = Date.now();
      this.saveToDisk();
    }
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.saveToDisk();
  }

  // ─── Pairing ───────────────────────────────────────────────────────────────

  getPairing(channel: string, userId: string): PairingEntry | undefined {
    return this.pairingStore.get(`${channel}:${userId}`);
  }

  createPairing(channel: string, userId: string): PairingEntry {
    const entry: PairingEntry = {
      userId,
      channel,
      approved: false,
      pairingCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: Date.now(),
    };
    this.pairingStore.set(`${channel}:${userId}`, entry);
    this.saveToDisk();
    return entry;
  }

  approvePairing(channel: string, userId: string): boolean {
    const key = `${channel}:${userId}`;
    const entry = this.pairingStore.get(key);
    if (!entry) return false;
    entry.approved = true;
    entry.approvedAt = Date.now();
    this.saveToDisk();
    return true;
  }

  isApproved(channel: string, userId: string): boolean {
    const entry = this.pairingStore.get(`${channel}:${userId}`);
    return entry?.approved ?? false;
  }

  listPairing(): PairingEntry[] {
    return Array.from(this.pairingStore.values());
  }
}
