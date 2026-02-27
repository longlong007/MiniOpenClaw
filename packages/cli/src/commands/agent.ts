import { Command } from "commander";
import WebSocket from "ws";

// ─── openclaw agent --message "..." ───────────────────────────────────────────

export function agentCommand(): Command {
  return new Command("agent")
    .description("Send a message to the agent via Gateway")
    .requiredOption("-m, --message <text>", "Message to send")
    .option("-s, --session <id>", "Session ID to use")
    .option("--port <port>", "Gateway port", "18789")
    .option("--token <token>", "Gateway auth token")
    .action(async (opts: { message: string; session?: string; port: string; token?: string }) => {
      const url = `ws://127.0.0.1:${opts.port}`;
      const ws = new WebSocket(url);
      let reqSeq = 0;
      const nextId = () => `req-${++reqSeq}`;

      const send = (frame: unknown) => ws.send(JSON.stringify(frame));

      ws.on("open", () => {
        // Authenticate
        const connectId = nextId();
        send({
          type: "req",
          id: connectId,
          method: "connect",
          params: { auth: opts.token ? { token: opts.token } : undefined },
        });

        ws.on("message", (data) => {
          const frame = JSON.parse(data.toString()) as {
            type: string;
            id?: string;
            ok?: boolean;
            event?: string;
            payload?: unknown;
          };

          if (frame.type === "res" && frame.id === connectId) {
            if (!frame.ok) {
              console.error("[agent] Authentication failed:", (frame as { error?: string }).error);
              ws.close();
              return;
            }

            // Now send agent request
            const agentId = nextId();
            send({
              type: "req",
              id: agentId,
              method: "agent",
              params: {
                message: opts.message,
                sessionId: opts.session,
                stream: true,
              },
            });
          }

          if (frame.type === "event" && frame.event === "agent") {
            const ev = frame.payload as {
              type: string;
              delta?: string;
              toolName?: string;
              error?: string;
              usage?: { inputTokens: number; outputTokens: number };
            };

            if (ev.type === "delta" && ev.delta) {
              process.stdout.write(ev.delta);
            } else if (ev.type === "tool_call") {
              process.stderr.write(`\n[tool] ${ev.toolName}\n`);
            } else if (ev.type === "done") {
              process.stdout.write("\n");
              if (ev.usage) {
                process.stderr.write(
                  `[usage] ${ev.usage.inputTokens} input, ${ev.usage.outputTokens} output tokens\n`
                );
              }
              ws.close();
            } else if (ev.type === "error") {
              process.stderr.write(`\n[error] ${ev.error}\n`);
              ws.close();
            }
          }
        });
      });

      ws.on("error", (err) => {
        console.error("[agent] Connection error:", err.message);
        process.exit(1);
      });

      ws.on("close", () => process.exit(0));
    });
}
