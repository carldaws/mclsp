import { describe, it, expect } from "vitest";
import { inferLanguageId, filePathToUri } from "../utils.js";

describe("inferLanguageId", () => {
  it("returns correct language for known extensions", () => {
    expect(inferLanguageId("foo.ts")).toBe("typescript");
    expect(inferLanguageId("foo.tsx")).toBe("typescriptreact");
    expect(inferLanguageId("foo.js")).toBe("javascript");
    expect(inferLanguageId("foo.jsx")).toBe("javascriptreact");
    expect(inferLanguageId("foo.py")).toBe("python");
    expect(inferLanguageId("foo.rb")).toBe("ruby");
    expect(inferLanguageId("foo.rs")).toBe("rust");
    expect(inferLanguageId("foo.go")).toBe("go");
    expect(inferLanguageId("foo.java")).toBe("java");
    expect(inferLanguageId("foo.css")).toBe("css");
    expect(inferLanguageId("foo.html")).toBe("html");
    expect(inferLanguageId("foo.json")).toBe("json");
    expect(inferLanguageId("foo.yaml")).toBe("yaml");
    expect(inferLanguageId("foo.md")).toBe("markdown");
  });

  it("returns plaintext for unknown extensions", () => {
    expect(inferLanguageId("foo.xyz")).toBe("plaintext");
    expect(inferLanguageId("foo.unknown")).toBe("plaintext");
  });

  it("handles full paths", () => {
    expect(inferLanguageId("/some/path/to/file.ts")).toBe("typescript");
    expect(inferLanguageId("src/components/App.tsx")).toBe("typescriptreact");
  });

  it("returns plaintext for files without extension", () => {
    expect(inferLanguageId("Makefile")).toBe("plaintext");
  });
});

describe("filePathToUri", () => {
  it("converts absolute path to file URI", () => {
    const uri = filePathToUri("/tmp/test.ts");
    expect(uri).toBe("file:///tmp/test.ts");
  });

  it("encodes special characters", () => {
    const uri = filePathToUri("/tmp/path with spaces/test.ts");
    expect(uri).toContain("file:///tmp/path%20with%20spaces/test.ts");
  });
});
