import type { ServerCapabilities } from "vscode-languageserver-protocol";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const POSITION_PARAMS = {
  file: { type: "string" as const, description: "Relative file path from project root" },
  line: { type: "number" as const, description: "Line number (1-indexed)" },
  col: { type: "number" as const, description: "Column number (1-indexed)" },
};

const POSITION_REQUIRED = ["file", "line", "col"];

interface CapabilityMapping {
  capabilityKey: keyof ServerCapabilities;
  tools: McpToolDefinition[];
}

const CAPABILITY_MAPPINGS: CapabilityMapping[] = [
  {
    capabilityKey: "definitionProvider",
    tools: [
      {
        name: "goto_definition",
        description: "Go to the definition of a symbol at the given position. Returns the file and location where the symbol is defined.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "typeDefinitionProvider",
    tools: [
      {
        name: "goto_type_definition",
        description: "Go to the type definition of a symbol. Returns where the type of the symbol at the given position is defined.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "implementationProvider",
    tools: [
      {
        name: "goto_implementation",
        description: "Go to implementations of an interface or abstract method. Returns concrete implementation locations.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "declarationProvider",
    tools: [
      {
        name: "goto_declaration",
        description: "Go to the declaration of a symbol (relevant in C/C++ for header declarations).",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "referencesProvider",
    tools: [
      {
        name: "find_references",
        description: "Find all references to a symbol across the project. Returns every location where the symbol is used.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "hoverProvider",
    tools: [
      {
        name: "hover",
        description: "Get hover information (type signature, documentation) for a symbol at the given position.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "signatureHelpProvider",
    tools: [
      {
        name: "signature_help",
        description: "Get parameter information for a function call at the given position.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "documentSymbolProvider",
    tools: [
      {
        name: "document_symbols",
        description: "Get all symbols (functions, classes, variables, etc.) defined in a file as a hierarchical tree.",
        inputSchema: {
          type: "object",
          properties: {
            file: POSITION_PARAMS.file,
          },
          required: ["file"],
        },
      },
    ],
  },
  {
    capabilityKey: "workspaceSymbolProvider",
    tools: [
      {
        name: "workspace_symbols",
        description: "Search for symbols across the entire project by name. Supports fuzzy matching.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Symbol name to search for" },
          },
          required: ["query"],
        },
      },
    ],
  },
  {
    capabilityKey: "codeActionProvider",
    tools: [
      {
        name: "code_actions",
        description: "Get available code actions (quick fixes, refactorings) at the given position. Optionally pass diagnostics to get targeted fixes.",
        inputSchema: {
          type: "object",
          properties: {
            ...POSITION_PARAMS,
            endLine: { type: "number", description: "End line of range (1-indexed, defaults to line)" },
            endCol: { type: "number", description: "End column of range (1-indexed, defaults to col)" },
          },
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "renameProvider",
    tools: [
      {
        name: "rename_prepare",
        description: "Check if a symbol at the given position can be renamed, and get its current name.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
      {
        name: "rename",
        description: "Rename a symbol and get all the file changes needed. Returns a workspace edit with changes across all affected files.",
        inputSchema: {
          type: "object",
          properties: {
            ...POSITION_PARAMS,
            newName: { type: "string", description: "The new name for the symbol" },
          },
          required: [...POSITION_REQUIRED, "newName"],
        },
      },
    ],
  },
  {
    capabilityKey: "callHierarchyProvider",
    tools: [
      {
        name: "call_hierarchy_incoming",
        description: "Find all functions/methods that call the function at the given position.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
      {
        name: "call_hierarchy_outgoing",
        description: "Find all functions/methods that are called by the function at the given position.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
  {
    capabilityKey: "typeHierarchyProvider",
    tools: [
      {
        name: "type_hierarchy",
        description: "Get the type hierarchy (supertypes and subtypes) for the type at the given position.",
        inputSchema: {
          type: "object",
          properties: POSITION_PARAMS,
          required: POSITION_REQUIRED,
        },
      },
    ],
  },
];

export function buildToolDefinitions(capabilities: ServerCapabilities): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];

  for (const mapping of CAPABILITY_MAPPINGS) {
    const capValue = capabilities[mapping.capabilityKey];
    if (capValue) {
      tools.push(...mapping.tools);
    }
  }

  // open_file and diagnostics are always available (no capability flag needed)
  tools.push({
    name: "open_file",
    description: "Open a file in the LSP server. This triggers diagnostics and makes the file available for subsequent no-arg diagnostics calls.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative file path from project root",
        },
      },
      required: ["file"],
    },
  });
  tools.push({
    name: "diagnostics",
    description: "Get current diagnostics (errors, warnings) for a file. If no file is specified, returns diagnostics for all currently open files with issues. Waits for fresh results after recent edits.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative file path (optional — omit for all currently open files with diagnostics)",
        },
      },
      required: [],
    },
  });

  return tools;
}
