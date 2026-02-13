#!/usr/bin/env node

import * as path from "node:path";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { LspManager } from "./lsp-manager.js";
import { buildToolDefinitions, buildExtensionToolDefinitions } from "./capability-mapper.js";
import { ToolHandler } from "./tool-handler.js";
import { log, logError } from "./utils.js";
import type { McpToolDefinition } from "./capability-mapper.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

async function main(): Promise<void> {
  const projectRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();

  log(`mclsp v${version} starting for project: ${projectRoot}`);

  // Load config
  const config = loadConfig(projectRoot);

  let manager: LspManager | null = null;
  let toolDefs: McpToolDefinition[] = [];
  let toolHandler: ToolHandler | null = null;

  if (config) {
    // Create manager (servers start lazily on first tool use)
    manager = new LspManager(config, projectRoot);

    // Register all standard tools unconditionally
    toolDefs = buildToolDefinitions();

    // Register extension tools based on configured commands
    const configuredExtensions = manager.getAllConfiguredExtensions();
    if (configuredExtensions.length > 0) {
      toolDefs.push(...buildExtensionToolDefinitions(configuredExtensions));
    }

    log(`Registered ${toolDefs.length} tools: ${toolDefs.map((t) => t.name).join(", ")}`);

    // Create tool handler
    toolHandler = new ToolHandler(manager);
  }

  // Create MCP server
  const mcpServer = new McpServer(
    { name: "mclsp", version },
    { capabilities: { tools: {} } }
  );

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefs.map((def: McpToolDefinition) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      })),
    };
  });

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!toolHandler) {
      return {
        content: [{ type: "text", text: "No mclsp.yaml config found in the project root. Create one to enable LSP tools." }],
        isError: true,
      };
    }
    const { name, arguments: args } = request.params;
    return toolHandler.handle(name, (args ?? {}) as Record<string, unknown>);
  });

  // Connect transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  log("MCP server connected via stdio");

  // Graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    if (manager) await manager.shutdownAll();
    await mcpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
