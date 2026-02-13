# mclsp

MCP server that bridges coding agents to Language Server Protocol (LSP) capabilities.

Configure one or more LSP servers, and mclsp exposes their features — go-to-definition, find references, diagnostics, rename, and more — as MCP tools. Servers start lazily on first tool use, so there's no startup cost for languages you don't touch.

## Quick Start

```bash
claude mcp add lsp -- npx -y mclsp
```

Then create a `mclsp.yaml` in your project root:

```yaml
servers:
  typescript:
    command: ["typescript-language-server", "--stdio"]
    filePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
```

## Configuration

Each server entry supports:

| Field | Required | Description |
|---|---|---|
| `command` | Yes | Command to start the LSP server (string array) |
| `filePatterns` | Yes | Glob patterns for files this server handles |
| `initializationOptions` | No | Options passed to the LSP server on initialization |
| `rootUri` | No | Override the workspace root URI |
| `env` | No | Environment variables for the LSP server process |

Multiple servers can be configured for different languages:

```yaml
servers:
  typescript:
    command: ["typescript-language-server", "--stdio"]
    filePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
  rust:
    command: ["rust-analyzer"]
    filePatterns: ["**/*.rs"]
  ruby:
    command: ["ruby-lsp"]
    filePatterns: ["**/*.rb"]
```

## Tools

All standard LSP tools are registered and available when a matching server is configured.

**Navigation:** `goto_definition`, `goto_type_definition`, `goto_implementation`, `goto_declaration`, `find_references`

**Inspection:** `hover`, `signature_help`, `document_symbols`, `workspace_symbols`

**Refactoring:** `code_actions`, `rename_prepare`, `rename`

**Hierarchy:** `call_hierarchy_incoming`, `call_hierarchy_outgoing`, `type_hierarchy`

**Always available:** `open_file`, `diagnostics`

All position-based tools take `file` (relative path), `line` (1-indexed), and `col` (1-indexed).

### Server Extensions

Some LSP servers support custom methods beyond the standard protocol. mclsp includes built-in extensions for:

- **Ruby LSP:** `ruby_discover_tests`, `ruby_go_to_relevant_file`, `ruby_show_syntax_tree`, `ruby_dependencies`
- **TypeScript:** `ts_go_to_source_definition`, `ts_organize_imports`

## Contributing Extensions

To add extensions for a new language server, create a file in `src/extensions/` (e.g. `src/extensions/python.ts`):

```typescript
import type { ServerExtension } from "./index.js";

const extensions: ServerExtension[] = [
  {
    name: "python_my_custom_method",
    method: "custom/myMethod",
    description: "Description of what this does",
    params: "textDocument", // or "textDocumentPosition" or "custom"
  },
];

export default extensions;
```

Then add the import and registry entry in `src/extensions/index.ts`.

## License

MIT
