import * as fs from "node:fs";
import picomatch from "picomatch";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as path from "node:path";
import { LspClient } from "./lsp-client.js";
import { log, logError } from "./utils.js";
import type { BridgeConfig } from "./types.js";
import type { ServerCapabilities } from "vscode-languageserver-protocol";

interface ManagedLsp {
  client: LspClient;
  matcher: (path: string) => boolean;
}

export class LspManager {
  private lsps: ManagedLsp[] = [];
  private rootPath: string;

  constructor(config: BridgeConfig, rootPath: string) {
    this.rootPath = rootPath;

    for (const [name, serverConfig] of Object.entries(config.servers)) {
      const client = new LspClient(name, serverConfig, rootPath);
      const matcher = picomatch(serverConfig.filePatterns);
      this.lsps.push({ client, matcher });
    }
  }

  async startAll(): Promise<void> {
    // Filter out servers whose root markers don't match any files in the project
    const eligible = this.lsps.filter((lsp) => {
      const markers = lsp.client.rootMarkers;
      if (!markers || markers.length === 0) return true;
      const found = markers.some((m) => fs.existsSync(path.join(this.rootPath, m)));
      if (!found) {
        log(`Skipping "${lsp.client.name}" — no root markers found (needs: ${markers.join(", ")})`);
      }
      return found;
    });

    this.lsps = eligible;

    if (this.lsps.length === 0) {
      log("No LSP servers matched root markers");
      return;
    }

    const results = await Promise.allSettled(
      this.lsps.map(async (lsp) => {
        try {
          await lsp.client.start();
        } catch (err) {
          logError(`Failed to start LSP "${lsp.client.name}"`, err);
          throw err;
        }
      })
    );

    const started = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed > 0) {
      log(`${started} LSP(s) started, ${failed} failed`);
    }

    // Remove failed LSPs
    this.lsps = this.lsps.filter((lsp) => lsp.client.running);

    if (this.lsps.length === 0) {
      log("All LSP servers failed to start");
      return;
    }

    log(`${this.lsps.length} LSP server(s) running`);
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

  getAggregatedCapabilities(): ServerCapabilities {
    const merged: ServerCapabilities = {};
    for (const lsp of this.lsps) {
      if (!lsp.client.running || !lsp.client.capabilities) continue;
      const caps = lsp.client.capabilities;

      if (caps.definitionProvider) merged.definitionProvider = true;
      if (caps.typeDefinitionProvider) merged.typeDefinitionProvider = true;
      if (caps.implementationProvider) merged.implementationProvider = true;
      if (caps.declarationProvider) merged.declarationProvider = true;
      if (caps.referencesProvider) merged.referencesProvider = true;
      if (caps.hoverProvider) merged.hoverProvider = true;
      if (caps.signatureHelpProvider) merged.signatureHelpProvider = caps.signatureHelpProvider;
      if (caps.documentSymbolProvider) merged.documentSymbolProvider = true;
      if (caps.workspaceSymbolProvider) merged.workspaceSymbolProvider = true;
      if (caps.codeActionProvider) merged.codeActionProvider = true;
      if (caps.renameProvider) merged.renameProvider = caps.renameProvider;
      if (caps.callHierarchyProvider) merged.callHierarchyProvider = true;
      if (caps.typeHierarchyProvider) merged.typeHierarchyProvider = true;
    }
    return merged;
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
