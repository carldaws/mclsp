import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as fs from "node:fs";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type ProtocolConnection,
} from "vscode-languageserver-protocol/lib/node/main.js";
import {
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidSaveTextDocumentNotification,
  PublishDiagnosticsNotification,
  DefinitionRequest,
  TypeDefinitionRequest,
  ImplementationRequest,
  DeclarationRequest,
  ReferencesRequest,
  HoverRequest,
  SignatureHelpRequest,
  DocumentSymbolRequest,
  WorkspaceSymbolRequest,
  CodeActionRequest,
  PrepareRenameRequest,
  RenameRequest,
  CallHierarchyPrepareRequest,
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  TypeHierarchyPrepareRequest,
  TypeHierarchySupertypesRequest,
  TypeHierarchySubtypesRequest,
  type ServerCapabilities,
  type InitializeParams,
  type Diagnostic,
  type Location,
  type Hover,
  type SignatureHelp,
  type DocumentSymbol,
  type SymbolInformation,
  type WorkspaceSymbol,
  type CodeAction,
  type Command,
  type WorkspaceEdit,
  type CallHierarchyItem,
  type CallHierarchyIncomingCall,
  type CallHierarchyOutgoingCall,
  type TypeHierarchyItem,
  type Range,
  type LocationLink,
  type Definition,
  type Declaration,
  type PrepareRenameResult,
} from "vscode-languageserver-protocol";
import { log, logError, inferLanguageId, filePathToUri } from "./utils.js";
import type { LspServerConfig, OpenDocument, CachedDiagnostics } from "./types.js";

const DIAGNOSTICS_FRESHNESS_MS = 500;
const DIAGNOSTICS_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

export class LspClient {
  readonly name: string;
  private config: LspServerConfig;
  private rootPath: string;
  private process: ChildProcess | null = null;
  private connection: ProtocolConnection | null = null;
  private _capabilities: ServerCapabilities | null = null;
  private openDocuments: Map<string, OpenDocument> = new Map();
  private diagnosticsCache: Map<string, CachedDiagnostics> = new Map();
  private diagnosticsWaiters: Map<string, Array<(diags: Diagnostic[]) => void>> = new Map();
  private _running = false;

  constructor(name: string, config: LspServerConfig, rootPath: string) {
    this.name = name;
    this.config = config;
    this.rootPath = rootPath;
  }

  get rootMarkers(): string[] | undefined {
    return this.config.rootMarkers;
  }

  get capabilities(): ServerCapabilities | null {
    return this._capabilities;
  }

  get running(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    const [cmd, ...args] = this.config.command;
    log(`[${this.name}] Starting LSP: ${this.config.command.join(" ")}`);

    const env = this.config.env
      ? { ...process.env, ...this.config.env }
      : process.env;

    this.process = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.rootPath,
      env,
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      log(`[${this.name}] stderr: ${data.toString().trimEnd()}`);
    });

    this.process.on("exit", (code, signal) => {
      log(`[${this.name}] LSP process exited (code=${code}, signal=${signal})`);
      this._running = false;
    });

    this.process.on("error", (err) => {
      logError(`[${this.name}] LSP process error`, err);
      this._running = false;
    });

    this.connection = createProtocolConnection(
      new StreamMessageReader(this.process.stdout!),
      new StreamMessageWriter(this.process.stdin!)
    );

    this.connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
      const cached: CachedDiagnostics = {
        uri: params.uri,
        diagnostics: params.diagnostics,
        timestamp: Date.now(),
      };
      this.diagnosticsCache.set(params.uri, cached);

      const waiters = this.diagnosticsWaiters.get(params.uri);
      if (waiters) {
        for (const resolve of waiters) {
          resolve(params.diagnostics);
        }
        this.diagnosticsWaiters.delete(params.uri);
      }
    });

    this.connection.listen();

    const rootUri = this.config.rootUri ?? pathToFileURL(this.rootPath).toString();
    const initParams: InitializeParams = {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ["markdown", "plaintext"],
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: false,
          },
          typeDefinition: {
            dynamicRegistration: false,
            linkSupport: false,
          },
          implementation: {
            dynamicRegistration: false,
            linkSupport: false,
          },
          declaration: {
            dynamicRegistration: false,
            linkSupport: false,
          },
          references: {
            dynamicRegistration: false,
          },
          signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
            },
          },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          codeAction: {
            dynamicRegistration: false,
          },
          rename: {
            dynamicRegistration: false,
            prepareSupport: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: {
              valueSet: [1, 2], // Unnecessary, Deprecated
            },
          },
          callHierarchy: {
            dynamicRegistration: false,
          },
          typeHierarchy: {
            dynamicRegistration: false,
          },
        },
        workspace: {
          workspaceFolders: false,
          symbol: {
            dynamicRegistration: false,
          },
        },
      },
      workspaceFolders: null,
      ...(this.config.initializationOptions && {
        initializationOptions: this.config.initializationOptions,
      }),
    };

    try {
      const result = await this.connection.sendRequest(InitializeRequest.type, initParams);
      this._capabilities = result.capabilities;
      log(`[${this.name}] Initialized. Capabilities: ${summarizeCapabilities(result.capabilities)}`);

      await this.connection.sendNotification(InitializedNotification.type, {});
      this._running = true;
    } catch (err) {
      logError(`[${this.name}] Initialize handshake failed`, err);
      this.kill();
      throw err;
    }
  }

  hasOpenDocument(filePath: string): boolean {
    const uri = filePathToUri(filePath);
    return this.openDocuments.has(uri);
  }

  async ensureOpen(filePath: string): Promise<string> {
    const uri = filePathToUri(filePath);
    if (this.openDocuments.has(uri)) {
      return uri;
    }

    const content = await fs.promises.readFile(filePath, "utf-8");
    const languageId = inferLanguageId(filePath);
    const doc: OpenDocument = { uri, languageId, version: 1, content };
    this.openDocuments.set(uri, doc);

    this.connection!.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId,
        version: doc.version,
        text: content,
      },
    });

    return uri;
  }

  async notifyOpen(filePath: string, content: string): Promise<void> {
    const uri = filePathToUri(filePath);
    const languageId = inferLanguageId(filePath);
    const doc: OpenDocument = { uri, languageId, version: 1, content };
    this.openDocuments.set(uri, doc);

    this.connection!.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId,
        version: doc.version,
        text: content,
      },
    });
  }

  async notifyChange(filePath: string, content: string): Promise<void> {
    const uri = filePathToUri(filePath);
    const doc = this.openDocuments.get(uri);

    if (!doc) {
      await this.notifyOpen(filePath, content);
      return;
    }

    doc.version++;
    doc.content = content;

    this.connection!.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: {
        uri,
        version: doc.version,
      },
      contentChanges: [{ text: content }],
    });
  }

  notifySave(filePath: string): void {
    const uri = filePathToUri(filePath);
    const doc = this.openDocuments.get(uri);
    if (!doc) return;

    this.connection!.sendNotification(DidSaveTextDocumentNotification.type, {
      textDocument: { uri },
      text: doc.content,
    });
  }

  notifyClose(filePath: string): void {
    const uri = filePathToUri(filePath);
    const doc = this.openDocuments.get(uri);
    if (!doc) return;

    this.connection!.sendNotification(DidCloseTextDocumentNotification.type, {
      textDocument: { uri },
    });
    this.openDocuments.delete(uri);
    this.diagnosticsCache.delete(uri);
  }

  // --- LSP Requests ---

  async gotoDefinition(uri: string, line: number, character: number): Promise<Definition | LocationLink[] | null> {
    return this.connection!.sendRequest(DefinitionRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async gotoTypeDefinition(uri: string, line: number, character: number): Promise<Definition | LocationLink[] | null> {
    return this.connection!.sendRequest(TypeDefinitionRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async gotoImplementation(uri: string, line: number, character: number): Promise<Definition | LocationLink[] | null> {
    return this.connection!.sendRequest(ImplementationRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async gotoDeclaration(uri: string, line: number, character: number): Promise<Declaration | LocationLink[] | null> {
    return this.connection!.sendRequest(DeclarationRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async findReferences(uri: string, line: number, character: number): Promise<Location[] | null> {
    return this.connection!.sendRequest(ReferencesRequest.type, {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  async hover(uri: string, line: number, character: number): Promise<Hover | null> {
    return this.connection!.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async signatureHelp(uri: string, line: number, character: number): Promise<SignatureHelp | null> {
    return this.connection!.sendRequest(SignatureHelpRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async documentSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.connection!.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri },
    });
  }

  async workspaceSymbols(query: string): Promise<WorkspaceSymbol[] | SymbolInformation[] | null> {
    return this.connection!.sendRequest(WorkspaceSymbolRequest.type, { query });
  }

  async codeActions(uri: string, range: Range, diagnostics: Diagnostic[]): Promise<(CodeAction | Command)[] | null> {
    return this.connection!.sendRequest(CodeActionRequest.type, {
      textDocument: { uri },
      range,
      context: { diagnostics },
    });
  }

  async prepareRename(uri: string, line: number, character: number): Promise<PrepareRenameResult | null> {
    return this.connection!.sendRequest(PrepareRenameRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async rename(uri: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null> {
    return this.connection!.sendRequest(RenameRequest.type, {
      textDocument: { uri },
      position: { line, character },
      newName,
    });
  }

  async prepareCallHierarchy(uri: string, line: number, character: number): Promise<CallHierarchyItem[] | null> {
    return this.connection!.sendRequest(CallHierarchyPrepareRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async callHierarchyIncoming(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[] | null> {
    return this.connection!.sendRequest(CallHierarchyIncomingCallsRequest.type, { item });
  }

  async callHierarchyOutgoing(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[] | null> {
    return this.connection!.sendRequest(CallHierarchyOutgoingCallsRequest.type, { item });
  }

  async prepareTypeHierarchy(uri: string, line: number, character: number): Promise<TypeHierarchyItem[] | null> {
    return this.connection!.sendRequest(TypeHierarchyPrepareRequest.type, {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async typeHierarchySupertypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[] | null> {
    return this.connection!.sendRequest(TypeHierarchySupertypesRequest.type, { item });
  }

  async typeHierarchySubtypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[] | null> {
    return this.connection!.sendRequest(TypeHierarchySubtypesRequest.type, { item });
  }

  // --- Diagnostics ---

  async waitForDiagnostics(uri: string, timeoutMs: number = DIAGNOSTICS_TIMEOUT_MS): Promise<Diagnostic[]> {
    const cached = this.diagnosticsCache.get(uri);
    if (cached && (Date.now() - cached.timestamp) < DIAGNOSTICS_FRESHNESS_MS) {
      return cached.diagnostics;
    }

    return new Promise<Diagnostic[]>((resolve) => {
      const timer = setTimeout(() => {
        const waiters = this.diagnosticsWaiters.get(uri);
        if (waiters) {
          const idx = waiters.indexOf(resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          if (waiters.length === 0) this.diagnosticsWaiters.delete(uri);
        }
        resolve(cached?.diagnostics ?? []);
      }, timeoutMs);

      const wrappedResolve = (diags: Diagnostic[]) => {
        clearTimeout(timer);
        resolve(diags);
      };

      if (!this.diagnosticsWaiters.has(uri)) {
        this.diagnosticsWaiters.set(uri, []);
      }
      this.diagnosticsWaiters.get(uri)!.push(wrappedResolve);
    });
  }

  getAllCachedDiagnostics(): CachedDiagnostics[] {
    return Array.from(this.diagnosticsCache.values()).filter(
      (d) => d.diagnostics.length > 0
    );
  }

  // --- Lifecycle ---

  async shutdown(): Promise<void> {
    if (!this.connection || !this._running) {
      this.kill();
      return;
    }

    log(`[${this.name}] Shutting down...`);
    this._running = false;

    try {
      await Promise.race([
        (async () => {
          await this.connection!.sendRequest(ShutdownRequest.type);
          this.connection!.sendNotification(ExitNotification.type);
        })(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Shutdown timeout")), SHUTDOWN_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      logError(`[${this.name}] Graceful shutdown failed, killing process`, err);
    }

    this.kill();
  }

  private kill(): void {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
    }
  }
}

function summarizeCapabilities(caps: ServerCapabilities): string {
  const supported: string[] = [];
  if (caps.definitionProvider) supported.push("definition");
  if (caps.typeDefinitionProvider) supported.push("typeDefinition");
  if (caps.implementationProvider) supported.push("implementation");
  if (caps.declarationProvider) supported.push("declaration");
  if (caps.referencesProvider) supported.push("references");
  if (caps.hoverProvider) supported.push("hover");
  if (caps.signatureHelpProvider) supported.push("signatureHelp");
  if (caps.documentSymbolProvider) supported.push("documentSymbol");
  if (caps.workspaceSymbolProvider) supported.push("workspaceSymbol");
  if (caps.codeActionProvider) supported.push("codeAction");
  if (caps.renameProvider) supported.push("rename");
  if (caps.callHierarchyProvider) supported.push("callHierarchy");
  if (caps.typeHierarchyProvider) supported.push("typeHierarchy");
  return supported.join(", ");
}
