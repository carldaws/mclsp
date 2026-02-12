#!/usr/bin/env node
// Integration test: spawns mclsp and sends MCP JSON-RPC messages over stdio (NDJSON)

import { spawn } from "node:child_process";
import * as readline from "node:readline";

const PROJECT_ROOT = process.cwd();
const child = spawn("node", ["dist/index.js", PROJECT_ROOT], {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stderr.on("data", (data) => {
  process.stderr.write(`[mclsp] ${data}`);
});

child.on("exit", (code) => {
  console.log(`\nmclsp exited with code ${code}`);
});

let msgId = 0;
const pending = new Map();

// MCP stdio uses newline-delimited JSON (NDJSON)
const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  } catch (err) {
    process.stderr.write(`[parse error] ${err.message}: ${line.slice(0, 100)}\n`);
  }
});

function sendRequest(method, params) {
  return new Promise((resolve) => {
    const id = ++msgId;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    pending.set(id, resolve);
    child.stdin.write(body);
  });
}

function sendNotification(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
  child.stdin.write(body);
}

function toolResult(response) {
  return JSON.parse(response.result?.content?.[0]?.text ?? "null");
}

async function run() {
  // Step 1: MCP initialize
  console.log("=== MCP Initialize ===");
  const initResult = await sendRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-harness", version: "0.1.0" },
  });
  console.log("Server:", initResult.result?.serverInfo?.name);
  console.log("Protocol:", initResult.result?.protocolVersion);

  // Send initialized notification
  sendNotification("notifications/initialized");

  // Wait for LSP to index
  console.log("\nWaiting 4s for LSP indexing...");
  await new Promise((r) => setTimeout(r, 4000));

  // Step 2: List tools
  console.log("\n=== List Tools ===");
  const toolsResult = await sendRequest("tools/list", {});
  const tools = toolsResult.result?.tools ?? [];
  console.log(`${tools.length} tools available:`);
  for (const t of tools) {
    console.log(`  - ${t.name}`);
  }

  // Step 3: hover on LspClient class (line 67 in .ts source)
  console.log("\n=== Hover: LspClient class (src/lsp-client.ts:67:14) ===");
  const hoverResult = await sendRequest("tools/call", {
    name: "hover",
    arguments: { file: "src/lsp-client.ts", line: 67, col: 14 },
  });
  const hover = toolResult(hoverResult);
  if (hover?.contents) {
    console.log(hover.contents.slice(0, 200));
  } else {
    console.log("(no hover info)");
  }

  // Step 4: document_symbols on utils.ts
  console.log("\n=== Document Symbols: src/utils.ts ===");
  const symResult = await sendRequest("tools/call", {
    name: "document_symbols",
    arguments: { file: "src/utils.ts" },
  });
  const syms = toolResult(symResult);
  if (Array.isArray(syms)) {
    for (const s of syms) {
      console.log(`  ${s.kind} ${s.name} @ line ${s.selectionRange?.start?.line ?? s.line}`);
    }
  }

  // Step 5: goto_definition on the LspClient import in lsp-manager.ts (line 5)
  console.log("\n=== Goto Definition: LspClient import (src/lsp-manager.ts:5:10) ===");
  const defResult = await sendRequest("tools/call", {
    name: "goto_definition",
    arguments: { file: "src/lsp-manager.ts", line: 5, col: 10 },
  });
  console.log(JSON.stringify(toolResult(defResult), null, 2));

  // Step 6: find_references on inferLanguageId (line 71 in .ts source)
  console.log("\n=== Find References: inferLanguageId (src/utils.ts:71:17) ===");
  const refResult = await sendRequest("tools/call", {
    name: "find_references",
    arguments: { file: "src/utils.ts", line: 71, col: 17 },
  });
  const refs = toolResult(refResult);
  if (Array.isArray(refs)) {
    for (const r of refs) {
      console.log(`  ${r.file}:${r.line}:${r.col}`);
    }
  } else if (refs) {
    console.log(`  ${refs.file}:${refs.line}:${refs.col}`);
  }

  // Step 7: diagnostics
  console.log("\n=== Diagnostics (all files) ===");
  const diagResult = await sendRequest("tools/call", {
    name: "diagnostics",
    arguments: {},
  });
  const diags = toolResult(diagResult);
  if (!diags || diags.length === 0) {
    console.log("  No diagnostics (clean!)");
  } else {
    for (const d of diags.slice(0, 10)) {
      console.log(`  ${d.severity}: ${d.file}:${d.line}:${d.col} — ${d.message}`);
    }
  }

  // Step 8: workspace_symbols
  console.log("\n=== Workspace Symbols: 'ToolHandler' ===");
  const wsResult = await sendRequest("tools/call", {
    name: "workspace_symbols",
    arguments: { query: "ToolHandler" },
  });
  const wSyms = toolResult(wsResult);
  if (Array.isArray(wSyms)) {
    for (const s of wSyms.slice(0, 5)) {
      console.log(`  ${s.kind} ${s.name} @ ${s.file}:${s.line}`);
    }
  }

  // Step 9: call_hierarchy_incoming on the handle method of ToolHandler (line 40)
  console.log("\n=== Call Hierarchy Incoming: ToolHandler.handle ===");
  const chResult = await sendRequest("tools/call", {
    name: "call_hierarchy_incoming",
    arguments: { file: "src/tool-handler.ts", line: 40, col: 9 },
  });
  const calls = toolResult(chResult);
  if (Array.isArray(calls)) {
    for (const c of calls) {
      console.log(`  ${c.from.name} (${c.from.kind}) @ ${c.from.file}:${c.from.line}`);
    }
  } else {
    console.log("  " + JSON.stringify(calls));
  }

  console.log("\n=== All tests completed! ===");
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1000);
}

run().catch((err) => {
  console.error("Test failed:", err);
  child.kill();
  process.exit(1);
});
