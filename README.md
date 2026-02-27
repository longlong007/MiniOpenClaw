# 🦞 Mini OpenClaw

A mini reimplementation of [OpenClaw](https://github.com/openclaw/openclaw) — your personal AI assistant, the lobster way.

Run it locally on any OS. Connect AI models to messaging channels. Chat via WebChat, Discord, or Feishu.

---

## Features

- **Gateway** — WebSocket control plane (ws://localhost:18789)
- **AI Agent** — Claude (Anthropic) and OpenAI support with tool calling and streaming
- **Discord channel** — Bot integration with DM pairing security
- **Feishu channel** — Webhook-based integration (private messages + @mentions)
- **WebChat** — Built-in browser UI served directly from the Gateway
- **CLI** — `openclaw gateway`, `openclaw agent`, `openclaw message`, `openclaw pairing`
- **Sessions** — Persistent conversation history (JSON file storage)
- **Skills** — SKILL.md file-based capability injection (web-search, summarize built-in)
- **Browser control** — Playwright-powered browser tool for web access

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Minimum required (pick one or more):
```env
ANTHROPIC_API_KEY=sk-ant-...   # Claude models
OPENAI_API_KEY=sk-...          # GPT models
DEEPSEEK_API_KEY=sk-...        # DeepSeek models (OpenAI-compatible)
ZHIPU_API_KEY=...              # 智谱 GLM models (OpenAI-compatible)
```

Model auto-selection priority (when no `model` prefix is set):
`anthropic` > `openai` > `deepseek` > `zhipu`

| Only key present | Default model |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropic/claude-opus-4-6` |
| `OPENAI_API_KEY` | `openai/gpt-4o` |
| `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| `ZHIPU_API_KEY` | `zhipu/glm-4-flash` |

Optional for channels:
```env
DISCORD_BOT_TOKEN=...
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
```

### 3. Build

```bash
pnpm build
```

### 4. Start the Gateway

```bash
node packages/cli/dist/index.js gateway
```

Or via npm script:
```bash
pnpm gateway
```

Open **http://localhost:18789** in your browser for the WebChat UI.

---

## CLI Reference

```bash
# Start gateway
openclaw gateway [--port 18789] [--bind loopback|all]

# Send a message to the agent (streams response)
openclaw agent --message "What is the capital of France?"

# Send a raw message to a session
openclaw message send --to <sessionId> --message "Hello"

# List sessions
openclaw message sessions

# List pairing requests
openclaw pairing list

# Approve a pairing request
openclaw pairing approve discord <userId>
openclaw pairing approve feishu <openId>
```

---

## Configuration

Config file: `~/.openclaw/openclaw.json`

```json
{
  "agent": {
    "model": "zhipu/glm-4-flash",
    "maxTokens": 4096,
    "browserEnabled": false,
    "apiKeys": {
      "anthropic": "sk-ant-...",
      "openai": "sk-...",
      "deepseek": "sk-...",
      "zhipu": "..."
    }
  },
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "token": ""
  },
  "channels": {
    "discord": {
      "token": "...",
      "dmPolicy": "pairing",
      "allowFrom": []
    },
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "verificationToken": "xxx",
      "encryptKey": "",
      "allowFrom": []
    }
  }
}
```

---

## Architecture

```
WebChat UI  ──┐
CLI          ──┤ WebSocket  ┌─────────────────────┐
               ├───────────►│   Gateway Server     │
Discord Bot  ──┤            │   :18789             │
Feishu Webhook─┘            │                      │
                            │  Sessions / Config   │
                            │  Skills Loader       │
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Agent Runner        │
                            │  (tool calling loop)  │
                            │                       │
                            │  Claude / OpenAI      │
                            │  Browser (Playwright) │
                            └──────────────────────┘
```

---

## Feishu Setup

1. Create a Feishu Self-Build App at [open.feishu.cn](https://open.feishu.cn)
2. Enable **Bot** capability
3. Set Webhook URL to: `http://your-host:18789/channels/feishu/webhook`
4. Copy App ID, App Secret, Verification Token to your config
5. Add necessary permissions: `im:message`, `im:message:send_as_bot`

---

## Discord Setup

1. Create a bot at [discord.com/developers](https://discord.com/developers)
2. Enable **Message Content Intent**
3. Copy the bot token to `DISCORD_BOT_TOKEN`
4. Invite the bot to your server with `bot` + `applications.commands` scopes
5. DM the bot — you'll receive a pairing code
6. Approve with: `openclaw pairing approve discord <userId>`

---

## Skills

Skills are Markdown files that extend the agent's capabilities.

Built-in skills: `skills/web-search/`, `skills/summarize/`

Add your own: `~/.openclaw/workspace/skills/<name>/SKILL.md`

---

## Project Structure

```
MiniOpenClaw/
├── packages/
│   ├── core/                # Protocol types, Config, Session schema
│   ├── gateway/             # WebSocket + HTTP server
│   ├── agent/               # AI agent runner + tools
│   ├── channels/
│   │   ├── discord/         # Discord integration
│   │   └── feishu/          # Feishu/Lark integration
│   └── cli/                 # openclaw CLI
├── ui/                      # WebChat frontend
├── skills/                  # Built-in skills
└── .env.example
```

---

## License

MIT
