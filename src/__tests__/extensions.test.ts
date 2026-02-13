import { describe, it, expect } from "vitest";
import { getExtensionsForCommand } from "../extensions/index.js";

describe("getExtensionsForCommand", () => {
  it("returns ruby extensions for ruby-lsp command", () => {
    const extensions = getExtensionsForCommand(["ruby-lsp"]);
    expect(extensions.length).toBeGreaterThan(0);
    expect(extensions.map((e) => e.name)).toContain("ruby_discover_tests");
    expect(extensions.map((e) => e.name)).toContain("ruby_go_to_relevant_file");
    expect(extensions.map((e) => e.name)).toContain("ruby_show_syntax_tree");
    expect(extensions.map((e) => e.name)).toContain("ruby_dependencies");
  });

  it("returns typescript extensions for typescript-language-server", () => {
    const extensions = getExtensionsForCommand(["typescript-language-server", "--stdio"]);
    expect(extensions.length).toBeGreaterThan(0);
    expect(extensions.map((e) => e.name)).toContain("ts_go_to_source_definition");
    expect(extensions.map((e) => e.name)).toContain("ts_organize_imports");
  });

  it("returns empty array for unknown commands", () => {
    const extensions = getExtensionsForCommand(["pylsp"]);
    expect(extensions).toEqual([]);
  });

  it("matches commands containing the pattern anywhere", () => {
    const extensions = getExtensionsForCommand(["/usr/local/bin/ruby-lsp", "--debug"]);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it("extension objects have required fields", () => {
    const extensions = getExtensionsForCommand(["ruby-lsp"]);
    for (const ext of extensions) {
      expect(ext).toHaveProperty("name");
      expect(ext).toHaveProperty("method");
      expect(ext).toHaveProperty("description");
      expect(ext).toHaveProperty("params");
      expect(["textDocument", "textDocumentPosition", "custom"]).toContain(ext.params);
    }
  });
});
