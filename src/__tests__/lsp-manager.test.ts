import { describe, it, expect, vi, beforeEach } from "vitest";
import { LspManager } from "../lsp-manager.js";
import type { MclspConfig } from "../types.js";

// Mock LspClient to avoid spawning real processes
vi.mock("../lsp-client.js", () => {
  class MockLspClient {
    name: string;
    running = false;
    capabilities = null;
    start = vi.fn(async () => { this.running = true; });
    shutdown = vi.fn(async () => {});
    constructor(name: string) {
      this.name = name;
    }
  }
  return { LspClient: MockLspClient };
});

const baseConfig: MclspConfig = {
  servers: {
    typescript: {
      command: ["typescript-language-server", "--stdio"],
      filePatterns: ["**/*.ts", "**/*.tsx"],
    },
    rust: {
      command: ["rust-analyzer"],
      filePatterns: ["**/*.rs"],
    },
  },
};

describe("LspManager", () => {
  describe("constructor", () => {
    it("creates managed LSP entries from config", () => {
      const manager = new LspManager(baseConfig, "/project");
      // All clients start as not running, so getAllClients returns empty
      expect(manager.getAllClients()).toEqual([]);
    });
  });

  describe("getClientForFile", () => {
    it("returns null when no servers are running", () => {
      const manager = new LspManager(baseConfig, "/project");
      expect(manager.getClientForFile("src/index.ts")).toBeNull();
    });
  });

  describe("ensureClientForFile", () => {
    it("starts the matching server and returns client", async () => {
      const manager = new LspManager(baseConfig, "/project");
      const client = await manager.ensureClientForFile("src/index.ts");
      expect(client).not.toBeNull();
      expect(client!.name).toBe("typescript");
      expect(client!.running).toBe(true);
    });

    it("returns running client without restarting", async () => {
      const manager = new LspManager(baseConfig, "/project");
      const client1 = await manager.ensureClientForFile("src/index.ts");
      const client2 = await manager.ensureClientForFile("src/other.ts");
      expect(client1).toBe(client2);
      expect(client1!.start).toHaveBeenCalledTimes(1);
    });

    it("starts different servers for different file types", async () => {
      const manager = new LspManager(baseConfig, "/project");
      const tsClient = await manager.ensureClientForFile("src/index.ts");
      const rsClient = await manager.ensureClientForFile("src/main.rs");
      expect(tsClient).not.toBeNull();
      expect(rsClient).not.toBeNull();
      expect(tsClient!.name).toBe("typescript");
      expect(rsClient!.name).toBe("rust");
    });

    it("returns null for unmatched file types", async () => {
      const manager = new LspManager(baseConfig, "/project");
      const client = await manager.ensureClientForFile("main.py");
      expect(client).toBeNull();
    });
  });

  describe("getAllClients", () => {
    it("returns only running clients", async () => {
      const manager = new LspManager(baseConfig, "/project");
      await manager.ensureClientForFile("src/index.ts");
      const clients = manager.getAllClients();
      expect(clients).toHaveLength(1);
      expect(clients[0].name).toBe("typescript");
    });
  });

  describe("getAllConfiguredExtensions", () => {
    it("returns extensions for all configured servers", () => {
      const manager = new LspManager(baseConfig, "/project");
      const extensions = manager.getAllConfiguredExtensions();
      expect(extensions.map((e) => e.name)).toContain("ts_go_to_source_definition");
      expect(extensions.map((e) => e.name)).toContain("ts_organize_imports");
    });
  });

  describe("path helpers", () => {
    it("toAbsolutePath resolves relative path", () => {
      const manager = new LspManager(baseConfig, "/project");
      expect(manager.toAbsolutePath("src/index.ts")).toBe("/project/src/index.ts");
    });

    it("toRelativePath converts URI to relative path", () => {
      const manager = new LspManager(baseConfig, "/project");
      expect(manager.toRelativePath("file:///project/src/index.ts")).toBe("src/index.ts");
    });

    it("toUri converts relative path to file URI", () => {
      const manager = new LspManager(baseConfig, "/project");
      expect(manager.toUri("src/index.ts")).toBe("file:///project/src/index.ts");
    });

    it("rootUri returns file URI for root path", () => {
      const manager = new LspManager(baseConfig, "/project");
      expect(manager.rootUri).toBe("file:///project");
    });
  });

  describe("shutdownAll", () => {
    it("calls shutdown on all clients", async () => {
      const manager = new LspManager(baseConfig, "/project");
      const client = await manager.ensureClientForFile("src/index.ts");
      await manager.shutdownAll();
      expect(client!.shutdown).toHaveBeenCalled();
    });
  });
});
