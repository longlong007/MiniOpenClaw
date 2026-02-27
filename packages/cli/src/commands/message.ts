import { Command } from "commander";
import WebSocket from "ws";

// ─── openclaw message send ─────────────────────────────────────────────────────

export function messageCommand(): Command {
  const cmd = new Command("message").description("Message operations");

  cmd
    .command("send")
    .description("Send a raw message to a session (no agent)")
    .requiredOption("--to <sessionId>", "Session ID")
    .requiredOption("--message <text>", "Message text")
    .option("--port <port>", "Gateway port", "18789")
    .option("--token <token>", "Gateway auth token")
    .action(async (opts: { to: string; message: string; port: string; token?: string }) => {
      const url = `ws://127.0.0.1:${opts.port}`;
      const ws = new WebSocket(url);
      let reqSeq = 0;
      const nextId = () => `req-${++reqSeq}`;
      const send = (frame: unknown) => ws.send(JSON.stringify(frame));

      ws.on("open", () => {
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
            error?: string;
          };

          if (frame.type === "res" && frame.id === connectId) {
            if (!frame.ok) {
              console.error("Auth failed:", frame.error);
              ws.close();
              return;
            }

            const msgId = nextId();
            send({
              type: "req",
              id: msgId,
              method: "send",
              params: { sessionId: opts.to, message: opts.message },
            });
          } else if (frame.type === "res" && frame.id !== connectId) {
            if (frame.ok) {
              console.log("Message sent.");
            } else {
              console.error("Failed:", frame.error);
            }
            ws.close();
          }
        });
      });

      ws.on("error", (err) => {
        console.error("Connection error:", err.message);
        process.exit(1);
      });

      ws.on("close", () => process.exit(0));
    });

  cmd
    .command("sessions")
    .description("List all sessions")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (opts: { port: string }) => {
      const res = await httpGet(`http://127.0.0.1:${opts.port}/__openclaw__/sessions`);
      const { sessions } = JSON.parse(res) as {
        sessions: Array<{ id: string; name?: string; messageCount: number; updatedAt: number }>;
      };
      for (const s of sessions) {
        console.log(`${s.id.slice(0, 8)} | ${s.name ?? "(unnamed)"} | ${s.messageCount} msgs | ${new Date(s.updatedAt).toLocaleString()}`);
      }
    });

  return cmd;
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    import("http").then(({ get }) => {
      get(url, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    }).catch(reject);
  });
}
