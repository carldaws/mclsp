# mclsp

MCP server that bridges coding agents to Language Server Protocol (LSP) capabilities.

Configure one or more LSP servers, and mclsp exposes their features — go-to-definition, find references, diagnostics, rename, and more — as MCP tools.

## Quick Start

```bash
claude mcp add mclsp -- npx -y mclsp
```

Then create a `.mclsp.json` in your project root:

```json
{
  "servers": {
    "typescript": {
      "command": ["typescript-language-server", "--stdio"],
      "filePatterns": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
      "rootMarkers": ["package.json", "tsconfig.json"]
    }
  }
}
```

## Configuration

Each server entry supports:

| Field | Required | Description |
|---|---|---|
| `command` | Yes | Command to start the LSP server (string array) |
| `filePatterns` | Yes | Glob patterns for files this server handles |
| `rootMarkers` | No | Files that must exist in the project root for this server to start |
| `initializationOptions` | No | Options passed to the LSP server on initialization |
| `rootUri` | No | Override the workspace root URI |
| `env` | No | Environment variables for the LSP server process |

Multiple servers can be configured for different languages. See `.mclsp.json.example` for a multi-language configuration.

## Tools

Tools are registered dynamically based on what the configured LSP servers support.

**Navigation:** `goto_definition`, `goto_type_definition`, `goto_implementation`, `goto_declaration`, `find_references`

**Inspection:** `hover`, `signature_help`, `document_symbols`, `workspace_symbols`

**Refactoring:** `code_actions`, `rename_prepare`, `rename`

**Hierarchy:** `call_hierarchy_incoming`, `call_hierarchy_outgoing`, `type_hierarchy`

**Always available:** `open_file`, `diagnostics`

All position-based tools take `file` (relative path), `line` (1-indexed), and `col` (1-indexed).

## License

MIT
