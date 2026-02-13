import rubyExtensions from "./ruby.js";
import typescriptExtensions from "./typescript.js";

export interface ServerExtension {
  name: string;
  method: string;
  description: string;
  params: "textDocument" | "textDocumentPosition" | "custom";
}

interface ServerExtensionRegistry {
  [commandPattern: string]: ServerExtension[];
}

const EXTENSION_REGISTRY: ServerExtensionRegistry = {
  "ruby-lsp": rubyExtensions,
  "typescript-language-server": typescriptExtensions,
};

export function getExtensionsForCommand(command: string[]): ServerExtension[] {
  const commandStr = command.join(" ");
  const extensions: ServerExtension[] = [];

  for (const [pattern, exts] of Object.entries(EXTENSION_REGISTRY)) {
    if (commandStr.includes(pattern)) {
      extensions.push(...exts);
    }
  }

  return extensions;
}
