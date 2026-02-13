import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../config.js";

// Use a temp dir for config tests
const TEST_ROOT = path.join(import.meta.dirname, "__fixtures__");

beforeEach(() => {
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

const VALID_CONFIG = `
servers:
  typescript:
    command: ["typescript-language-server", "--stdio"]
    filePatterns: ["**/*.ts", "**/*.tsx"]
`;

function writeConfig(content: string, filename = "mclsp.yaml") {
  fs.writeFileSync(path.join(TEST_ROOT, filename), content);
}

describe("loadConfig", () => {
  it("returns null when no config file exists", () => {
    const config = loadConfig(TEST_ROOT);
    expect(config).toBeNull();
  });

  it("loads mclsp.yaml", () => {
    writeConfig(VALID_CONFIG, "mclsp.yaml");
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript.command).toEqual(["typescript-language-server", "--stdio"]);
  });

  it("loads mclsp.yml", () => {
    writeConfig(VALID_CONFIG, "mclsp.yml");
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript).toBeDefined();
  });

  it("loads .mclsp.yaml", () => {
    writeConfig(VALID_CONFIG, ".mclsp.yaml");
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript).toBeDefined();
  });

  it("loads .mclsp.yml", () => {
    writeConfig(VALID_CONFIG, ".mclsp.yml");
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript).toBeDefined();
  });

  it("prefers mclsp.yaml over dotfile variants", () => {
    writeConfig(VALID_CONFIG, "mclsp.yaml");
    writeConfig(`
servers:
  rust:
    command: ["rust-analyzer"]
    filePatterns: ["**/*.rs"]
`, ".mclsp.yaml");
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript).toBeDefined();
    expect(config!.servers.rust).toBeUndefined();
  });

  it("loads config with optional fields", () => {
    writeConfig(VALID_CONFIG);
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.servers.typescript.command).toEqual(["typescript-language-server", "--stdio"]);
    expect(config!.servers.typescript.filePatterns).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("loads config with optional fields", () => {
    writeConfig(`
servers:
  ruby:
    command: ["ruby-lsp"]
    filePatterns: ["**/*.rb"]
    initializationOptions:
      enableExperimentalFeatures: true
    rootUri: "file:///custom/root"
    env:
      BUNDLE_GEMFILE: "Gemfile"
`);
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    const ruby = config!.servers.ruby;
    expect(ruby.initializationOptions).toEqual({ enableExperimentalFeatures: true });
    expect(ruby.rootUri).toBe("file:///custom/root");
    expect(ruby.env).toEqual({ BUNDLE_GEMFILE: "Gemfile" });
  });

  it("loads config with multiple servers", () => {
    writeConfig(`
servers:
  typescript:
    command: ["typescript-language-server", "--stdio"]
    filePatterns: ["**/*.ts"]
  rust:
    command: ["rust-analyzer"]
    filePatterns: ["**/*.rs"]
`);
    const config = loadConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(Object.keys(config!.servers)).toEqual(["typescript", "rust"]);
  });

  it("does not load .mclsp.json files", () => {
    fs.writeFileSync(
      path.join(TEST_ROOT, ".mclsp.json"),
      JSON.stringify({
        servers: {
          ts: { command: ["tls"], filePatterns: ["**/*.ts"] },
        },
      })
    );
    const config = loadConfig(TEST_ROOT);
    expect(config).toBeNull();
  });

  it("throws on invalid YAML", () => {
    writeConfig("{{invalid yaml");
    expect(() => loadConfig(TEST_ROOT)).toThrow("Failed to parse");
  });

  it("throws when servers is missing", () => {
    writeConfig("foo: bar");
    expect(() => loadConfig(TEST_ROOT)).toThrow('must have a "servers" object');
  });

  it("throws when servers is an array", () => {
    writeConfig(`
servers:
  - command: ["tls"]
    filePatterns: ["**/*.ts"]
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('must have a "servers" object');
  });

  it("throws when servers is empty", () => {
    writeConfig("servers: {}");
    expect(() => loadConfig(TEST_ROOT)).toThrow("at least one server");
  });

  it("throws when command is missing", () => {
    writeConfig(`
servers:
  ts:
    filePatterns: ["**/*.ts"]
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"command" array of strings');
  });

  it("throws when command is empty", () => {
    writeConfig(`
servers:
  ts:
    command: []
    filePatterns: ["**/*.ts"]
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"command" array of strings');
  });

  it("throws when filePatterns is missing", () => {
    writeConfig(`
servers:
  ts:
    command: ["tls"]
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"filePatterns" array of strings');
  });

  it("throws when initializationOptions is not an object", () => {
    writeConfig(`
servers:
  ts:
    command: ["tls"]
    filePatterns: ["**/*.ts"]
    initializationOptions: "bad"
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"initializationOptions" must be an object');
  });

  it("throws when rootUri is not a string", () => {
    writeConfig(`
servers:
  ts:
    command: ["tls"]
    filePatterns: ["**/*.ts"]
    rootUri: 123
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"rootUri" must be a string');
  });

  it("throws when env is not an object", () => {
    writeConfig(`
servers:
  ts:
    command: ["tls"]
    filePatterns: ["**/*.ts"]
    env: "bad"
`);
    expect(() => loadConfig(TEST_ROOT)).toThrow('"env" must be an object');
  });
});
