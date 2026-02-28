# 🦞 Mini OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) 的迷你实现版本 — 您的个人 AI 助手，龙虾风格。

可在任何操作系统上本地运行。将 AI 模型连接到消息渠道。通过 WebChat、Discord 或飞书进行聊天。

---

## 功能特性

- **Gateway** — WebSocket 控制平面 (ws://localhost:18789)
- **AI Agent** — 支持 Claude (Anthropic) 和 OpenAI，具备工具调用和流式输出能力
- **Discord 频道** — 机器人集成，支持 DM 配对安全机制
- **飞书频道** — 基于 Webhook 的集成（私信 + @提及）
- **WebChat** — 内置浏览器 UI，直接从 Gateway 提供服务
- **CLI** — `openclaw gateway`、`openclaw agent`、`openclaw message`、`openclaw pairing`
- **会话** — 持久化对话历史（JSON 文件存储）
- **技能** — 基于 SKILL.md 文件的能力注入（内置网页搜索、总结功能）
- **浏览器控制** — 基于 Playwright 的浏览器工具，支持网页访问

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置

将 `.env.example` 复制为 `.env` 并填写您的密钥：

```bash
cp .env.example .env
```

最低要求配置（选择一项或多项）：
```env
ANTHROPIC_API_KEY=sk-ant-...   # Claude 模型
OPENAI_API_KEY=sk-...          # GPT 模型
DEEPSEEK_API_KEY=sk-...        # DeepSeek 模型（OpenAI 兼容）
ZHIPU_API_KEY=...              # 智谱 GLM 模型（OpenAI 兼容）
```

模型自动选择优先级（未设置 `model` 前缀时）：
`anthropic` > `openai` > `deepseek` > `zhipu`

| 仅存在的密钥 | 默认模型 |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropic/claude-opus-4-6` |
| `OPENAI_API_KEY` | `openai/gpt-4o` |
| `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| `ZHIPU_API_KEY` | `zhipu/glm-4-flash` |

渠道可选配置：
```env
DISCORD_BOT_TOKEN=...
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
```

### 3. 构建

```bash
pnpm build
```

### 4. 启动 Gateway

```bash
node packages/cli/dist/index.js gateway
```

或使用 npm 脚本：
```bash
pnpm gateway
```

在浏览器中打开 **http://localhost:18789** 访问 WebChat UI。

---

## CLI 参考

```bash
# 启动 gateway
openclaw gateway [--port 18789] [--bind loopback|all]

# 向 agent 发送消息（流式响应）
openclaw agent --message "法国的首都是哪里？"

# 向会话发送原始消息
openclaw message send --to <sessionId> --message "你好"

# 列出所有会话
openclaw message sessions

# 列出配对请求
openclaw pairing list

# 批准配对请求
openclaw pairing approve discord <userId>
openclaw pairing approve feishu <openId>
```

---

## 配置

配置文件：`~/.openclaw/openclaw.json`

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

## 架构

```
WebChat UI  ──┐
CLI          ──┤ WebSocket  ┌─────────────────────┐
               ├───────────►│   Gateway 服务器     │
Discord 机器人 ──┤            │   :18789             │
飞书 Webhook  ──┘            │                      │
                            │  会话 / 配置          │
                            │  技能加载器           │
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Agent 运行器        │
                            │  （工具调用循环）      │
                            │                       │
                            │  Claude / OpenAI     │
                            │  浏览器 (Playwright)  │
                            └──────────────────────┘
```

---

## 飞书配置

1. 在 [open.feishu.cn](https://open.feishu.cn) 创建飞书自建应用
2. 启用 **机器人** 功能
3. 设置 Webhook 地址为：`http://your-host:18789/channels/feishu/webhook`
4. 将应用 ID、应用密钥、验证令牌复制到配置中
5. 添加必要权限：`im:message`、`im:message:send_as_bot`

---

## Discord 配置

1. 在 [discord.com/developers](https://discord.com/developers) 创建机器人
2. 启用 **消息内容意图**
3. 将机器人令牌复制到 `DISCORD_BOT_TOKEN`
4. 使用 `bot` + `applications.commands` 权限将机器人邀请到您的服务器
5.私信机器人 — 您将收到一个配对码
6. 使用以下命令批准：`openclaw pairing approve discord <userId>`

---

## 技能

技能是扩展 agent 能力的 Markdown 文件。

内置技能：`skills/web-search/`、`skills/summarize/`

添加自定义技能：`~/.openclaw/workspace/skills/<name>/SKILL.md`

---

## 项目结构

```
MiniOpenClaw/
├── packages/
│   ├── core/                # 协议类型、配置、会话 schema
│   ├── gateway/             # WebSocket + HTTP 服务器
│   ├── agent/               # AI agent 运行器 + 工具
│   ├── channels/
│   │   ├── discord/         # Discord 集成
│   │   └── feishu/          # 飞书/Lark 集成
│   └── cli/                 # openclaw CLI
├── ui/                      # WebChat 前端
├── skills/                  # 内置技能
└── .env.example
```

---

## 许可证

MIT
