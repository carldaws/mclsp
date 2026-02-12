#!/usr/bin/env node

import * as path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { LspManager } from "./lsp-manager.js";
import { FileWatcher } from "./file-watcher.js";
import { buildToolDefinitions } from "./capability-mapper.js";
import { ToolHandler } from "./tool-handler.js";
import { log, logError } from "./utils.js";
import type { McpToolDefinition } from "./capability-mapper.js";

async function main(): Promise<void> {
  const projectRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();

  log(`mclsp starting for project: ${projectRoot}`);

  // Load config
  const config = loadConfig(projectRoot);

  let manager: LspManager | null = null;
  let toolDefs: McpToolDefinition[] = [];
  let toolHandler: ToolHandler | null = null;
  let fileWatcher: FileWatcher | null = null;

  if (config) {
    // Start LSP servers
    manager = new LspManager(config, projectRoot);
    await manager.startAll();

    // Build tool definitions from aggregated capabilities
    const capabilities = manager.getAggregatedCapabilities();
    toolDefs = buildToolDefinitions(capabilities);
    log(`Registered ${toolDefs.length} tools: ${toolDefs.map((t) => t.name).join(", ")}`);

    // Create tool handler
    toolHandler = new ToolHandler(manager);

    // Start file watcher
    fileWatcher = new FileWatcher(manager, projectRoot);
    fileWatcher.start();
  }

  // Create MCP server
  const server = new Server(
    { name: "mclsp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefs.map((def: McpToolDefinition) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!toolHandler) {
      return {
        content: [{ type: "text", text: "No .mclsp.json config found in the project root. Create one to enable LSP tools. See .mclsp.json.example for reference." }],
        isError: true,
      };
    }
    const { name, arguments: args } = request.params;
    return toolHandler.handle(name, (args ?? {}) as Record<string, unknown>);
  });

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server connected via stdio");

  // Graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    if (fileWatcher) await fileWatcher.stop();
    if (manager) await manager.shutdownAll();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
