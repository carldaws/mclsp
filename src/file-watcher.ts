import * as fs from "node:fs";
import * as path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { LspManager } from "./lsp-manager.js";
import { log, logError } from "./utils.js";

// Chokidar v4 does not filter directories with glob patterns —
// it still walks into them and sets up watchers.  A function-based
// `ignored` is the only reliable way to prevent traversal.
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".cache",
  ".turbo",
  "coverage",
  ".nyc_output",
  "venv",
  ".venv",
  ".tox",
  // Rails / Ruby
  "vendor",
  "tmp",
  "log",
  "storage",
  // Misc
  ".terraform",
  ".gradle",
  ".cargo",
]);

function isIgnored(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some((part) => IGNORED_SEGMENTS.has(part));
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private manager: LspManager;
  private rootPath: string;

  constructor(manager: LspManager, rootPath: string) {
    this.manager = manager;
    this.rootPath = rootPath;
  }

  start(): void {
    log("Starting file watcher...");

    this.watcher = chokidar.watch(this.rootPath, {
      ignoreInitial: true,
      ignored: isIgnored,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("change", (filePath: string) => this.handleChange(filePath));
    this.watcher.on("unlink", (filePath: string) => this.handleUnlink(filePath));

    this.watcher.on("error", (err: unknown) => {
      logError("File watcher error", err);
    });

    log("File watcher started");
  }

  /**
   * Only notify the LSP about files it already has open.
   * The LSP indexes the project from disk on its own — we don't need to
   * didOpen every file we see. We only need to keep already-opened documents
   * in sync when the agent (or user) edits them outside the LSP.
   */
  private async handleChange(filePath: string): Promise<void> {
    const relativePath = path.relative(this.rootPath, filePath);
    const clients = this.manager.getClientsForFile(relativePath);

    if (clients.length === 0) return;

    const interestedClients = clients.filter((c) => c.hasOpenDocument(filePath));
    if (interestedClients.length === 0) return;

    try {
      const content = await fs.promises.readFile(filePath, "utf-8");

      for (const client of interestedClients) {
        try {
          await client.notifyChange(filePath, content);
          client.notifySave(filePath);
        } catch (err) {
          logError(`Failed to notify LSP "${client.name}" about ${relativePath}`, err);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logError(`Failed to read ${relativePath}`, err);
      }
    }
  }

  private handleUnlink(filePath: string): void {
    const relativePath = path.relative(this.rootPath, filePath);
    const clients = this.manager.getClientsForFile(relativePath);

    for (const client of clients) {
      try {
        client.notifyClose(filePath);
      } catch (err) {
        logError(`Failed to notify LSP "${client.name}" about deletion of ${relativePath}`, err);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      log("Stopping file watcher...");
      await this.watcher.close();
      this.watcher = null;
      log("File watcher stopped");
    }
  }
}
