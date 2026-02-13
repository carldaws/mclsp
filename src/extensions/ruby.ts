import type { ServerExtension } from "./index.js";

const extensions: ServerExtension[] = [
  {
    name: "ruby_discover_tests",
    method: "rubyLsp/discoverTests",
    description: "Discover test cases (Minitest, RSpec) in a Ruby file",
    params: "textDocument",
  },
  {
    name: "ruby_go_to_relevant_file",
    method: "experimental/goToRelevantFile",
    description: "Navigate between implementation and test file",
    params: "textDocument",
  },
  {
    name: "ruby_show_syntax_tree",
    method: "rubyLsp/textDocument/showSyntaxTree",
    description: "Show the Prism AST for a Ruby file",
    params: "textDocument",
  },
  {
    name: "ruby_dependencies",
    method: "rubyLsp/workspace/dependencies",
    description: "List project gem dependencies",
    params: "custom",
  },
];

export default extensions;
