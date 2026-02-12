import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./utils.js";
import type { BridgeConfig, LspServerConfig } from "./types.js";

const CONFIG_FILENAME = ".mclsp.json";

export function loadConfig(projectRoot: string): BridgeConfig | null {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    log(`No ${CONFIG_FILENAME} found in ${projectRoot} — starting with no LSP servers`);
    return null;
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse ${configPath}: ${err instanceof Error ? err.message : err}`);
  }

  return validateConfig(raw);
}

function validateConfig(raw: unknown): BridgeConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config must be a JSON object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.servers !== "object" || obj.servers === null || Array.isArray(obj.servers)) {
    throw new Error('Config must have a "servers" object');
  }

  const servers: Record<string, LspServerConfig> = {};
  const serversObj = obj.servers as Record<string, unknown>;

  for (const [name, value] of Object.entries(serversObj)) {
    servers[name] = validateServerConfig(name, value);
  }

  if (Object.keys(servers).length === 0) {
    throw new Error("Config must define at least one server");
  }

  log(`Loaded config with ${Object.keys(servers).length} server(s): ${Object.keys(servers).join(", ")}`);

  return { servers };
}

function validateServerConfig(name: string, raw: unknown): LspServerConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Server "${name}" must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.command) || obj.command.length === 0 || !obj.command.every((c: unknown) => typeof c === "string")) {
    throw new Error(`Server "${name}" must have a "command" array of strings`);
  }

  if (!Array.isArray(obj.filePatterns) || obj.filePatterns.length === 0 || !obj.filePatterns.every((p: unknown) => typeof p === "string")) {
    throw new Error(`Server "${name}" must have a "filePatterns" array of strings`);
  }

  const config: LspServerConfig = {
    command: obj.command as string[],
    filePatterns: obj.filePatterns as string[],
  };

  if (obj.initializationOptions !== undefined) {
    if (typeof obj.initializationOptions !== "object" || obj.initializationOptions === null) {
      throw new Error(`Server "${name}": "initializationOptions" must be an object`);
    }
    config.initializationOptions = obj.initializationOptions as Record<string, unknown>;
  }

  if (obj.rootUri !== undefined) {
    if (typeof obj.rootUri !== "string") {
      throw new Error(`Server "${name}": "rootUri" must be a string`);
    }
    config.rootUri = obj.rootUri;
  }

  if (obj.env !== undefined) {
    if (typeof obj.env !== "object" || obj.env === null) {
      throw new Error(`Server "${name}": "env" must be an object`);
    }
    config.env = obj.env as Record<string, string>;
  }

  if (obj.rootMarkers !== undefined) {
    if (!Array.isArray(obj.rootMarkers) || !obj.rootMarkers.every((m: unknown) => typeof m === "string")) {
      throw new Error(`Server "${name}": "rootMarkers" must be an array of strings`);
    }
    config.rootMarkers = obj.rootMarkers as string[];
  }

  return config;
}
