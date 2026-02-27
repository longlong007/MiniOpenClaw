import { Command } from "commander";

// ─── openclaw pairing ─────────────────────────────────────────────────────────

export function pairingCommand(): Command {
  const cmd = new Command("pairing").description("Manage channel pairing");

  cmd
    .command("list")
    .description("List pending pairing requests")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (opts: { port: string }) => {
      const res = await httpGet(`http://127.0.0.1:${opts.port}/__openclaw__/pairing`);
      const { entries } = JSON.parse(res) as {
        entries: Array<{
          channel: string;
          userId: string;
          approved: boolean;
          pairingCode?: string;
          createdAt: number;
        }>;
      };

      if (entries.length === 0) {
        console.log("No pairing entries.");
        return;
      }

      for (const e of entries) {
        const status = e.approved ? "✅ approved" : "⏳ pending";
        console.log(`${e.channel}:${e.userId} | ${status} | code: ${e.pairingCode ?? "—"} | ${new Date(e.createdAt).toLocaleString()}`);
      }
    });

  cmd
    .command("approve <channel> <userId>")
    .description("Approve a pairing request")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (channel: string, userId: string, opts: { port: string }) => {
      const res = await httpPost(
        `http://127.0.0.1:${opts.port}/__openclaw__/pairing/approve`,
        { channel, userId }
      );
      const data = JSON.parse(res) as { ok: boolean };
      if (data.ok) {
        console.log(`✅ Approved ${channel}:${userId}`);
      } else {
        console.error(`❌ Pairing not found for ${channel}:${userId}`);
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

function httpPost(url: string, body: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    import("http").then(({ request }) => {
      const payload = JSON.stringify(body);
      const urlObj = new URL(url);
      const req = request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname,
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          res.on("end", () => resolve(data));
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    }).catch(reject);
  });
}
