import type { ServerExtension } from "./index.js";

const extensions: ServerExtension[] = [
  {
    name: "ts_go_to_source_definition",
    method: "_typescript.goToSourceDefinition",
    description: "Go to the source definition (not .d.ts) of a symbol",
    params: "textDocumentPosition",
  },
  {
    name: "ts_organize_imports",
    method: "_typescript.organizeImports",
    description: "Organize imports in a TypeScript file",
    params: "textDocument",
  },
];

export default extensions;
