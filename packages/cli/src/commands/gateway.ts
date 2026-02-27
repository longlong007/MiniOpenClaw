import { Command } from "commander";
import { loadConfig } from "@mini-openclaw/core";
import { GatewayServer } from "@mini-openclaw/gateway";
import type { ChannelRouter } from "@mini-openclaw/gateway";
import { AgentRunnerImpl } from "@mini-openclaw/agent";
import { DiscordChannel } from "@mini-openclaw/channel-discord";
import { FeishuChannel } from "@mini-openclaw/channel-feishu";

export function gatewayCommand(): Command {
  return new Command("gateway")
    .description("Start the Mini OpenClaw gateway server")
    .option("-p, --port <port>", "Port to listen on", "18789")
    .option("--bind <bind>", "Bind address: loopback or all", "loopback")
    .option("--no-discord", "Disable Discord channel")
    .option("--no-feishu", "Disable Feishu channel")
    .action(async (opts: { port: string; bind: string; discord: boolean; feishu: boolean }) => {
      const config = loadConfig();

      // Override config with CLI flags
      if (opts.port) config.gateway.port = parseInt(opts.port);
      if (opts.bind) config.gateway.bind = opts.bind as "loopback" | "all";

      // Collect channel routers (webhook-based channels)
      const channelRouters: ChannelRouter[] = [];

      // Placeholder sessions — will be replaced after server creation
      // We need to build the feishu channel after server is created to get real sessions
      const server = new GatewayServer({ config, channelRouters });
      const sessions = server.getSessionStore();
      const agentRunner = new AgentRunnerImpl(config.agent, sessions);

      // Re-inject agent runner (gateway uses StubRunner by default; swap it out)
      // We recreate the server with the real agent runner and channels
      const feishuChannels: FeishuChannel[] = [];
      if (opts.feishu && config.channels?.feishu?.appId) {
        const feishu = new FeishuChannel(
          config.channels.feishu,
          sessions,
          agentRunner
        );
        feishuChannels.push(feishu);
        channelRouters.push(feishu);
      }

      const finalServer = new GatewayServer({
        config,
        agentRunner,
        channelRouters,
      });
      const finalSessions = finalServer.getSessionStore();
      const finalAgentRunner = new AgentRunnerImpl(config.agent, finalSessions);

      // Start non-webhook channels
      const channels: Array<{ start(): Promise<void>; stop(): Promise<void> }> = [];

      if (opts.discord && config.channels?.discord?.token) {
        const discord = new DiscordChannel(
          config.channels.discord,
          finalSessions,
          finalAgentRunner
        );
        channels.push(discord);
      }

      await finalServer.start();

      for (const ch of channels) {
        await ch.start();
      }

      console.log("[openclaw] Gateway ready 🦞");
      if (opts.discord && config.channels?.discord?.token) {
        console.log("[openclaw] Discord channel: enabled");
      }
      if (opts.feishu && config.channels?.feishu?.appId) {
        console.log("[openclaw] Feishu channel: enabled (webhook at /channels/feishu/webhook)");
      }

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\n[gateway] Shutting down...");
        for (const ch of channels) await ch.stop();
        await finalServer.stop();
        process.exit(0);
      };

      process.on("SIGINT", () => { void shutdown(); });
      process.on("SIGTERM", () => { void shutdown(); });
    });
}
