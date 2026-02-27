// ─── Mini OpenClaw WebChat ─────────────────────────────────────────────────────

interface WsFrame {
  type: "req" | "res" | "event";
  id?: string;
  ok?: boolean;
  payload?: unknown;
  error?: string;
  event?: string;
  seq?: number;
  method?: string;
  params?: unknown;
}

interface AgentEvent {
  runId: string;
  type: "delta" | "tool_call" | "tool_result" | "done" | "error";
  delta?: string;
  toolName?: string;
  toolResult?: unknown;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

interface SessionSummary {
  id: string;
  name?: string;
  channel?: string;
  messageCount: number;
  updatedAt: number;
}

// ─── State ─────────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let currentSessionId: string | null = null;
let pendingRequests = new Map<string, (res: WsFrame) => void>();
let streamingBubble: HTMLElement | null = null;
let isAgentRunning = false;
let reqSeq = 0;

// ─── Elements ──────────────────────────────────────────────────────────────────

const statusDot = document.getElementById("status-dot")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const sessionListEl = document.getElementById("session-list")!;
const emptyState = document.getElementById("empty-state")!;
const btnNewSession = document.getElementById("btn-new-session")!;

// ─── WebSocket ─────────────────────────────────────────────────────────────────

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    setStatus("connecting");
    const id = nextId();
    pendingRequests.set(id, (res) => {
      if (res.ok) {
        setStatus("connected");
        loadSessions();
      } else {
        setStatus("error");
      }
    });
    send({ type: "req", id, method: "connect", params: {} });
  };

  ws.onmessage = (e) => {
    try {
      const frame = JSON.parse(e.data as string) as WsFrame;
      handleFrame(frame);
    } catch {/* ignore */}
  };

  ws.onclose = () => {
    setStatus("disconnected");
    setTimeout(connect, 3000);
  };

  ws.onerror = () => setStatus("error");
}

function send(frame: WsFrame): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

function nextId(): string {
  return `req-${++reqSeq}`;
}

function request(method: string, params?: unknown): Promise<WsFrame> {
  return new Promise((resolve) => {
    const id = nextId();
    pendingRequests.set(id, resolve);
    send({ type: "req", id, method, params });
  });
}

// ─── Frame handler ─────────────────────────────────────────────────────────────

function handleFrame(frame: WsFrame): void {
  if (frame.type === "res" && frame.id) {
    const cb = pendingRequests.get(frame.id);
    if (cb) {
      pendingRequests.delete(frame.id);
      cb(frame);
    }
    return;
  }

  if (frame.type === "event") {
    handleEvent(frame);
  }
}

function handleEvent(frame: WsFrame): void {
  if (frame.event === "agent") {
    handleAgentEvent(frame.payload as AgentEvent);
  }
}

function handleAgentEvent(event: AgentEvent): void {
  if (!event) return;

  switch (event.type) {
    case "delta":
      if (event.delta) appendDelta(event.delta);
      break;
    case "tool_call":
      appendToolBadge(`🔧 Calling tool: ${event.toolName ?? "unknown"}`);
      break;
    case "tool_result":
      appendToolBadge(`✅ Tool result received`);
      break;
    case "done":
      finishStream(event.usage);
      break;
    case "error":
      finishStream();
      appendErrorBubble(event.error ?? "Unknown error");
      break;
  }
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

function setStatus(state: "connecting" | "connected" | "disconnected" | "error"): void {
  statusDot.className = "status-dot";
  if (state === "connected") statusDot.classList.add("connected");
  if (state === "error") statusDot.classList.add("error");
  statusDot.title = state.charAt(0).toUpperCase() + state.slice(1);
}

function hideEmpty(): void {
  emptyState.style.display = "none";
}

function appendUserBubble(text: string): void {
  hideEmpty();
  const el = document.createElement("div");
  el.className = "message user";
  el.innerHTML = `
    <div class="bubble">${escHtml(text)}</div>
    <span class="message-meta">${formatTime(Date.now())}</span>
  `;
  messagesEl.appendChild(el);
  scrollBottom();
}

function startAssistantBubble(): void {
  hideEmpty();
  const el = document.createElement("div");
  el.className = "message assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble streaming";
  el.appendChild(bubble);
  messagesEl.appendChild(el);
  streamingBubble = bubble;
  scrollBottom();
}

function appendDelta(delta: string): void {
  if (!streamingBubble) startAssistantBubble();
  const existing = streamingBubble!.textContent?.replace(/▋$/, "") ?? "";
  streamingBubble!.textContent = existing + delta;
  scrollBottom();
}

function finishStream(usage?: { inputTokens: number; outputTokens: number }): void {
  if (streamingBubble) {
    streamingBubble.classList.remove("streaming");
    // Add timestamp
    const parent = streamingBubble.parentElement!;
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = formatTime(Date.now()) + (usage ? ` · ${usage.inputTokens}↑ ${usage.outputTokens}↓ tokens` : "");
    parent.appendChild(meta);
    streamingBubble = null;
  }
  isAgentRunning = false;
  sendBtn.disabled = false;
  loadSessions();
}

function appendToolBadge(text: string): void {
  if (!streamingBubble) startAssistantBubble();
  const parent = streamingBubble!.parentElement!;
  const badge = document.createElement("div");
  badge.className = "tool-badge";
  badge.textContent = text;
  parent.insertBefore(badge, streamingBubble);
  scrollBottom();
}

function appendErrorBubble(text: string): void {
  const el = document.createElement("div");
  el.className = "message assistant";
  el.innerHTML = `<div class="bubble" style="color:#f44336">❌ ${escHtml(text)}</div>`;
  messagesEl.appendChild(el);
  scrollBottom();
  isAgentRunning = false;
  sendBtn.disabled = false;
}

function scrollBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Sessions ──────────────────────────────────────────────────────────────────

async function loadSessions(): Promise<void> {
  const res = await request("sessions.list");
  if (!res.ok) return;
  const { sessions } = res.payload as { sessions: SessionSummary[] };

  sessionListEl.innerHTML = "";
  for (const s of sessions) {
    const li = document.createElement("li");
    li.textContent = s.name ?? s.id.slice(0, 8);
    li.title = `${s.messageCount} messages · ${formatTime(s.updatedAt)}`;
    if (s.id === currentSessionId) li.classList.add("active");
    li.onclick = () => selectSession(s.id);
    sessionListEl.appendChild(li);
  }
}

async function selectSession(id: string): Promise<void> {
  currentSessionId = id;
  messagesEl.innerHTML = "";
  emptyState.style.display = "none";

  const res = await request("sessions.history", { sessionId: id, limit: 50 });
  if (!res.ok) return;

  const { messages } = res.payload as { messages: { role: string; content: string; timestamp: number }[] };
  for (const m of messages) {
    if (m.role === "user") {
      const el = document.createElement("div");
      el.className = "message user";
      el.innerHTML = `<div class="bubble">${escHtml(m.content)}</div><span class="message-meta">${formatTime(m.timestamp)}</span>`;
      messagesEl.appendChild(el);
    } else if (m.role === "assistant") {
      const el = document.createElement("div");
      el.className = "message assistant";
      el.innerHTML = `<div class="bubble">${escHtml(m.content)}</div><span class="message-meta">${formatTime(m.timestamp)}</span>`;
      messagesEl.appendChild(el);
    }
  }

  scrollBottom();
  await loadSessions();
}

// ─── Send message ──────────────────────────────────────────────────────────────

async function sendMessage(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text || isAgentRunning) return;

  inputEl.value = "";
  autoResize();
  isAgentRunning = true;
  sendBtn.disabled = true;

  appendUserBubble(text);
  startAssistantBubble();

  await request("agent", {
    message: text,
    sessionId: currentSessionId ?? undefined,
    stream: true,
  });
}

// ─── Auto-resize textarea ──────────────────────────────────────────────────────

function autoResize(): void {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 180) + "px";
}

// ─── Event listeners ───────────────────────────────────────────────────────────

sendBtn.addEventListener("click", () => { void sendMessage(); });

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
});

inputEl.addEventListener("input", autoResize);

btnNewSession.addEventListener("click", () => {
  currentSessionId = null;
  messagesEl.innerHTML = "";
  emptyState.style.display = "flex";
  loadSessions().catch(() => {});
});

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

connect();
