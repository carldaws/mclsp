import picomatch from "picomatch";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as path from "node:path";
import { LspClient } from "./lsp-client.js";
import { log, logError } from "./utils.js";
import type { MclspConfig } from "./types.js";
import { getExtensionsForCommand, type ServerExtension } from "./extensions/index.js";

interface ManagedLsp {
  client: LspClient;
  matcher: (path: string) => boolean;
  command: string[];
}

export class LspManager {
  private lsps: ManagedLsp[] = [];
  private rootPath: string;

  constructor(config: MclspConfig, rootPath: string) {
    this.rootPath = rootPath;

    for (const [name, serverConfig] of Object.entries(config.servers)) {
      const client = new LspClient(name, serverConfig, rootPath);
      const matcher = picomatch(serverConfig.filePatterns);
      this.lsps.push({ client, matcher, command: serverConfig.command });
    }
  }

  async ensureClientForFile(relativePath: string): Promise<LspClient | null> {
    // Return already-running client if available
    const running = this.getClientForFile(relativePath);
    if (running) return running;

    // Find matching but not-yet-started server
    const lsp = this.lsps.find((l) => !l.client.running && l.matcher(relativePath));
    if (!lsp) return null;

    try {
      await lsp.client.start();
      return lsp.client;
    } catch (err) {
      logError(`Failed to start LSP "${lsp.client.name}"`, err);
      return null;
    }
  }

  getClientForFile(relativePath: string): LspClient | null {
    for (const lsp of this.lsps) {
      if (lsp.client.running && lsp.matcher(relativePath)) {
        return lsp.client;
      }
    }
    return null;
  }

  getClientsForFile(relativePath: string): LspClient[] {
    return this.lsps
      .filter((lsp) => lsp.client.running && lsp.matcher(relativePath))
      .map((lsp) => lsp.client);
  }

  getAllClients(): LspClient[] {
    return this.lsps.filter((lsp) => lsp.client.running).map((lsp) => lsp.client);
  }

  getAllExtensions(): { extension: ServerExtension; client: LspClient }[] {
    const results: { extension: ServerExtension; client: LspClient }[] = [];
    for (const lsp of this.lsps) {
      if (!lsp.client.running) continue;
      const extensions = getExtensionsForCommand(lsp.command);
      for (const extension of extensions) {
        results.push({ extension, client: lsp.client });
      }
    }
    return results;
  }

  getAllConfiguredExtensions(): ServerExtension[] {
    const extensions: ServerExtension[] = [];
    for (const lsp of this.lsps) {
      extensions.push(...getExtensionsForCommand(lsp.command));
    }
    return extensions;
  }

  getClientForExtensionTool(toolName: string): { client: LspClient; extension: ServerExtension } | null {
    for (const lsp of this.lsps) {
      if (!lsp.client.running) continue;
      const extensions = getExtensionsForCommand(lsp.command);
      const extension = extensions.find((e) => e.name === toolName);
      if (extension) {
        return { client: lsp.client, extension };
      }
    }
    return null;
  }

  toUri(relativePath: string): string {
    const absPath = path.resolve(this.rootPath, relativePath);
    return pathToFileURL(absPath).toString();
  }

  toAbsolutePath(relativePath: string): string {
    return path.resolve(this.rootPath, relativePath);
  }

  toRelativePath(uri: string): string {
    const absPath = fileURLToPath(uri);
    return path.relative(this.rootPath, absPath);
  }

  get rootUri(): string {
    return pathToFileURL(this.rootPath).toString();
  }

  async shutdownAll(): Promise<void> {
    log("Shutting down all LSP servers...");
    await Promise.allSettled(
      this.lsps.map((lsp) => lsp.client.shutdown())
    );
    log("All LSP servers shut down");
  }
}
