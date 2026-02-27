#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { gatewayCommand } from "./commands/gateway.js";
import { agentCommand } from "./commands/agent.js";
import { messageCommand } from "./commands/message.js";
import { pairingCommand } from "./commands/pairing.js";

program
  .name("openclaw")
  .description("🦞 Mini OpenClaw — Personal AI Assistant")
  .version("0.1.0");

program.addCommand(gatewayCommand());
program.addCommand(agentCommand());
program.addCommand(messageCommand());
program.addCommand(pairingCommand());

program.parse();
