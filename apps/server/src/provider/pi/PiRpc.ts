import * as ChildProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import * as readline from "node:readline";

export const DEFAULT_PI_SCRIPT_PATH = "pi";
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_PI_DEV_LAUNCHER_CANDIDATES = [
  Path.join(OS.homedir(), "Developer", "pi-mono", "pi-test.sh"),
  Path.join(OS.homedir(), "Developer", "pi-mono", "pi-test.cmd"),
] as const;
const PI_AUTOREASON_ENABLE_ARGS = ["--enable-autoreason"] as const;
const EMBEDDED_PI_TELEMETRY_ENV = "0";
const EMBEDDED_PI_AGENT_DIR_ROOT = Path.join(OS.tmpdir(), "t3code-pi-agent-home");

export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface PiRpcModel {
  readonly provider: string;
  readonly id: string;
  readonly contextWindow?: number;
  readonly reasoning?: boolean;
}

export type PiRpcSlashCommandSource = "extension" | "prompt" | "skill";

export interface PiRpcSlashCommand {
  readonly name: string;
  readonly description?: string;
  readonly source: PiRpcSlashCommandSource;
}

export interface PiRpcSessionState {
  readonly model?: PiRpcModel;
  readonly thinkingLevel: string;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly steeringMode: "all" | "one-at-a-time";
  readonly followUpMode: "all" | "one-at-a-time";
  readonly sessionFile?: string;
  readonly sessionId: string;
  readonly sessionName?: string;
  readonly autoCompactionEnabled: boolean;
  readonly messageCount: number;
  readonly pendingMessageCount: number;
}

export interface PiRpcSessionStats {
  readonly sessionFile?: string;
  readonly sessionId: string;
  readonly userMessages: number;
  readonly assistantMessages: number;
  readonly toolCalls: number;
  readonly toolResults: number;
  readonly totalMessages: number;
  readonly tokens: {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly total: number;
  };
  readonly cost: number;
  readonly contextUsage?: {
    readonly tokens: number | null;
    readonly contextWindow: number;
    readonly percent: number | null;
  };
}

export interface PiRpcTextContent {
  readonly type: "text";
  readonly text: string;
}

export interface PiRpcThinkingContent {
  readonly type: "thinking";
  readonly thinking: string;
  readonly redacted?: boolean;
}

export interface PiRpcToolCallContent {
  readonly type: "toolCall";
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface PiRpcImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export interface PiRpcUserMessage {
  readonly role: "user";
  readonly content: string | Array<PiRpcTextContent | PiRpcImageContent>;
  readonly timestamp: number;
}

export interface PiRpcAssistantMessage {
  readonly role: "assistant";
  readonly content: Array<PiRpcTextContent | PiRpcThinkingContent | PiRpcToolCallContent>;
  readonly provider: string;
  readonly model: string;
  readonly stopReason: string;
  readonly errorMessage?: string;
  readonly timestamp: number;
}

export interface PiRpcToolResultMessage {
  readonly role: "toolResult";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly content: Array<PiRpcTextContent | PiRpcImageContent>;
  readonly details?: unknown;
  readonly isError: boolean;
  readonly timestamp: number;
}

export interface PiRpcBashExecutionMessage {
  readonly role: "bashExecution";
  readonly command: string;
  readonly output: string;
  readonly exitCode?: number;
  readonly cancelled: boolean;
  readonly truncated: boolean;
  readonly fullOutputPath?: string;
  readonly excludeFromContext?: boolean;
  readonly timestamp: number;
}

export interface PiRpcBranchSummaryMessage {
  readonly role: "branchSummary";
  readonly summary: string;
  readonly fromId: string;
  readonly timestamp: number;
}

export interface PiRpcCompactionSummaryMessage {
  readonly role: "compactionSummary";
  readonly summary: string;
  readonly tokensBefore: number;
  readonly timestamp: number;
}

export interface PiRpcCustomMessage {
  readonly role: "custom";
  readonly customType: string;
  readonly content: string | Array<PiRpcTextContent | PiRpcImageContent>;
  readonly display: boolean;
  readonly details?: unknown;
  readonly timestamp: number;
}

export type PiRpcMessage =
  | PiRpcUserMessage
  | PiRpcAssistantMessage
  | PiRpcToolResultMessage
  | PiRpcBashExecutionMessage
  | PiRpcBranchSummaryMessage
  | PiRpcCompactionSummaryMessage
  | PiRpcCustomMessage;

export interface PiRpcPromptImage {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export type PiRpcExtensionUiRequest =
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "select";
      readonly title: string;
      readonly options: string[];
      readonly timeout?: number;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "confirm";
      readonly title: string;
      readonly message: string;
      readonly timeout?: number;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "input";
      readonly title: string;
      readonly placeholder?: string;
      readonly timeout?: number;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "editor";
      readonly title: string;
      readonly prefill?: string;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "notify";
      readonly message: string;
      readonly notifyType?: "info" | "warning" | "error";
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "setStatus";
      readonly statusKey: string;
      readonly statusText?: string;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "setWidget";
      readonly widgetKey: string;
      readonly widgetLines?: string[];
      readonly widgetPlacement?: "aboveEditor" | "belowEditor";
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "setTitle";
      readonly title: string;
    }
  | {
      readonly type: "extension_ui_request";
      readonly id: string;
      readonly method: "set_editor_text";
      readonly text: string;
    };

export type PiRpcEvent =
  | PiRpcExtensionUiRequest
  | {
      readonly type: "turn_start";
    }
  | {
      readonly type: "turn_end";
      readonly message?: PiRpcMessage;
      readonly toolResults?: ReadonlyArray<unknown>;
    }
  | {
      readonly type: "message_start";
      readonly message: PiRpcMessage;
    }
  | {
      readonly type: "message_update";
      readonly message: PiRpcMessage;
    }
  | {
      readonly type: "message_end";
      readonly message: PiRpcMessage;
    }
  | {
      readonly type: "tool_execution_start";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args?: Record<string, unknown>;
    }
  | {
      readonly type: "tool_execution_update";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args?: Record<string, unknown>;
      readonly partialResult?: unknown;
    }
  | {
      readonly type: "tool_execution_end";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result?: unknown;
      readonly isError?: boolean;
    }
  | {
      readonly type: "queue_update";
      readonly steering: string[];
      readonly followUp: string[];
    }
  | {
      readonly type: "compaction_start";
      readonly reason?: "manual" | "threshold" | "overflow";
    }
  | {
      readonly type: "compaction_end";
      readonly reason?: "manual" | "threshold" | "overflow";
      readonly aborted?: boolean;
      readonly willRetry?: boolean;
      readonly errorMessage?: string;
    }
  | {
      readonly type: "auto_retry_start";
      readonly attempt?: number;
      readonly maxAttempts?: number;
      readonly delayMs?: number;
      readonly errorMessage?: string;
    }
  | {
      readonly type: "auto_retry_end";
      readonly success?: boolean;
      readonly attempt?: number;
      readonly finalError?: string;
    }
  | {
      readonly type: "agent_start";
    }
  | {
      readonly type: "agent_end";
      readonly messages?: PiRpcMessage[];
    };

interface PiRpcResponseSuccess<T> {
  readonly id?: string;
  readonly type: "response";
  readonly command: string;
  readonly success: true;
  readonly data?: T;
}

interface PiRpcResponseFailure {
  readonly id?: string;
  readonly type: "response";
  readonly command: string;
  readonly success: false;
  readonly error: string;
}

type PiRpcResponse<T> = PiRpcResponseSuccess<T> | PiRpcResponseFailure;

type PendingRequest = {
  readonly command: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBinaryPath(binaryPath: string): string {
  if (binaryPath === "~") {
    return OS.homedir();
  }
  if (binaryPath.startsWith("~/") || binaryPath.startsWith("~\\")) {
    return Path.join(OS.homedir(), binaryPath.slice(2));
  }
  return binaryPath;
}

function isExplicitBinaryPath(binaryPath: string): boolean {
  return (
    Path.isAbsolute(binaryPath) ||
    binaryPath.startsWith(".") ||
    binaryPath.startsWith("~") ||
    binaryPath.includes("/") ||
    binaryPath.includes("\\")
  );
}

export function resolvePiLauncherPath(binaryPath: string | undefined): string {
  const normalizedBinaryPath = normalizeBinaryPath(
    (binaryPath?.trim() || DEFAULT_PI_SCRIPT_PATH).trim(),
  );
  if (isExplicitBinaryPath(normalizedBinaryPath)) {
    return normalizedBinaryPath;
  }
  if (normalizedBinaryPath !== DEFAULT_PI_SCRIPT_PATH) {
    return normalizedBinaryPath;
  }

  for (const candidate of DEFAULT_PI_DEV_LAUNCHER_CANDIDATES) {
    if (FS.existsSync(candidate)) {
      return candidate;
    }
  }

  return normalizedBinaryPath;
}

function supportsAutoreasonLauncherToggle(binaryPath: string): boolean {
  const baseName = Path.basename(binaryPath).toLowerCase();
  return baseName === "pi-test.sh" || baseName === "pi-test.cmd";
}

export function resolvePiLauncherInvocation(input?: {
  readonly binaryPath?: string;
  readonly enableAutoreason?: boolean;
  readonly fullAutonomy?: boolean;
}): {
  readonly binaryPath: string;
  readonly args: ReadonlyArray<string>;
} {
  const binaryPath = resolvePiLauncherPath(input?.binaryPath);
  const args: string[] = [];
  if (input?.enableAutoreason && supportsAutoreasonLauncherToggle(binaryPath)) {
    args.push(...PI_AUTOREASON_ENABLE_ARGS);
  }
  if (input?.fullAutonomy) {
    args.push("--full-autonomy");
  }
  return {
    binaryPath,
    args,
  };
}

export function buildPiLauncherEnv(input?: {
  readonly homePath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly disableTelemetry?: boolean;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...input?.env,
  };
  const homePath = input?.homePath?.trim();
  if (homePath) {
    env.PI_CODING_AGENT_DIR = homePath;
  }
  // Pi 0.67.1 added install telemetry for interactive startup only, but Pi Code
  // embeds pi as an RPC runtime. Keep embedded launches explicitly telemetry-free
  // so future upstream telemetry changes cannot leak through the app wrapper.
  if (input?.disableTelemetry) {
    env.PI_TELEMETRY = EMBEDDED_PI_TELEMETRY_ENV;
  }
  return env;
}

function getDefaultPiAgentDir(): string {
  return Path.join(process.env.HOME || OS.homedir(), ".pi", "agent");
}

function embeddedPiAgentDirForSource(sourceAgentDir: string): string {
  const digest = crypto.createHash("sha256").update(sourceAgentDir).digest("hex").slice(0, 16);
  return Path.join(EMBEDDED_PI_AGENT_DIR_ROOT, digest);
}

function sanitizePiAgentSettingsForEmbeddedRuntime(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...settings };

  delete sanitized.extensions;
  delete sanitized.skills;
  delete sanitized.prompts;
  delete sanitized.themes;

  if (Array.isArray(settings.packages)) {
    sanitized.packages = settings.packages.flatMap((entry) => {
      if (typeof entry === "string") {
        return [{ source: entry, extensions: [] }];
      }
      if (isRecord(entry) && typeof entry.source === "string" && entry.source.trim().length > 0) {
        return [{ ...entry, extensions: [] }];
      }
      return [];
    });
  }

  return sanitized;
}

async function syncPiAgentFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    const sourceBytes = await FS.promises.readFile(sourcePath);
    const existingBytes = await FS.promises.readFile(destinationPath).catch(() => null);
    if (existingBytes && Buffer.compare(sourceBytes, existingBytes) === 0) {
      return;
    }
    await FS.promises.mkdir(Path.dirname(destinationPath), { recursive: true });
    await FS.promises.writeFile(destinationPath, sourceBytes);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function syncEmbeddedPiSettings(
  sourceAgentDir: string,
  destinationAgentDir: string,
): Promise<void> {
  const sourceSettingsPath = Path.join(sourceAgentDir, "settings.json");
  const destinationSettingsPath = Path.join(destinationAgentDir, "settings.json");
  let parsedSettings: unknown;
  try {
    parsedSettings = JSON.parse(await FS.promises.readFile(sourceSettingsPath, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (!isRecord(parsedSettings)) {
    return;
  }

  const sanitized = `${JSON.stringify(sanitizePiAgentSettingsForEmbeddedRuntime(parsedSettings), null, 2)}\n`;
  const existing = await FS.promises.readFile(destinationSettingsPath, "utf8").catch(() => null);
  if (existing === sanitized) {
    return;
  }
  await FS.promises.mkdir(destinationAgentDir, { recursive: true });
  await FS.promises.writeFile(destinationSettingsPath, sanitized, "utf8");
}

export async function prepareEmbeddedPiLauncherEnv(
  env?: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv | undefined> {
  const sourceAgentDir = env?.PI_CODING_AGENT_DIR?.trim() || getDefaultPiAgentDir();
  const destinationAgentDir = embeddedPiAgentDirForSource(sourceAgentDir);
  await FS.promises.mkdir(destinationAgentDir, { recursive: true });
  await Promise.all([
    syncEmbeddedPiSettings(sourceAgentDir, destinationAgentDir),
    syncPiAgentFile(
      Path.join(sourceAgentDir, "auth.json"),
      Path.join(destinationAgentDir, "auth.json"),
    ),
    syncPiAgentFile(
      Path.join(sourceAgentDir, "models.json"),
      Path.join(destinationAgentDir, "models.json"),
    ),
  ]);

  return {
    ...env,
    PI_CODING_AGENT_DIR: destinationAgentDir,
  };
}

export function parsePiVersion(output: string): string | null {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  return match?.[1] ?? null;
}

export function extractAssistantText(message: PiRpcAssistantMessage): string {
  return message.content
    .filter((block): block is PiRpcTextContent => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function extractAssistantThinking(message: PiRpcAssistantMessage): string {
  return message.content
    .filter((block): block is PiRpcThinkingContent => block.type === "thinking" && !block.redacted)
    .map((block) => block.thinking)
    .join("");
}

export function extractToolResultText(message: PiRpcToolResultMessage): string {
  const contentText = message.content
    .map((block) => (block.type === "text" ? block.text : `[image:${block.mimeType}]`))
    .join("\n\n");
  const detailsText =
    message.details === undefined ? "" : `\n\n${JSON.stringify(message.details, null, 2)}`;
  return `${contentText}${detailsText}`.trim();
}

export function extractDiffText(details: unknown): string | null {
  if (!isRecord(details)) {
    return null;
  }
  return asTrimmedString(details.diff);
}

export function isPiRpcResponse(value: unknown): value is PiRpcResponse<unknown> {
  return isRecord(value) && value.type === "response";
}

export function isPiRpcEvent(value: unknown): value is PiRpcEvent {
  return isRecord(value) && typeof value.type === "string" && value.type !== "response";
}

export class PiRpcProcess {
  private readonly process: ChildProcess.ChildProcessWithoutNullStreams;
  private readonly stdoutReader: readline.Interface;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly onEvent: (event: PiRpcEvent) => void;
  private readonly onExit:
    | ((input: {
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
        readonly stderr: string;
      }) => void)
    | undefined;
  private requestId = 0;
  private closed = false;
  private stderr = "";
  private readonly exitPromise: Promise<void>;

  private constructor(input: {
    process: ChildProcess.ChildProcessWithoutNullStreams;
    onEvent: (event: PiRpcEvent) => void;
    onExit?: (input: {
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
      readonly stderr: string;
    }) => void;
  }) {
    this.process = input.process;
    this.onEvent = input.onEvent;
    this.onExit = input.onExit;

    this.stdoutReader = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });
    this.stdoutReader.on("line", (line) => {
      void this.handleLine(line);
    });

    this.process.stderr.on("data", (chunk: Buffer | string) => {
      this.stderr += chunk.toString();
    });

    this.exitPromise = new Promise((resolve) => {
      let settled = false;
      const finalize = (input: {
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
        readonly detail: string;
      }) => {
        if (settled) {
          return;
        }
        settled = true;
        this.closed = true;
        this.stdoutReader.close();
        for (const pending of this.pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(
            new Error(
              `pi RPC process exited while waiting for '${pending.command}' (code=${input.code ?? "null"}, signal=${input.signal ?? "null"}).\n${input.detail}`,
            ),
          );
        }
        this.pendingRequests.clear();
        this.onExit?.({ code: input.code, signal: input.signal, stderr: input.detail });
        resolve();
      };

      this.process.once("exit", (code, signal) => {
        finalize({
          code,
          signal,
          detail: this.stderr,
        });
      });
      this.process.once("error", (error) => {
        finalize({
          code: null,
          signal: null,
          detail: `${this.stderr}\n${error.message}`.trim(),
        });
      });
    });
  }

  static async start(input: {
    readonly binaryPath?: string;
    readonly enableAutoreason?: boolean;
    readonly fullAutonomy?: boolean;
    readonly cwd: string;
    readonly sessionFile: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly onEvent?: (event: PiRpcEvent) => void;
    readonly onExit?: (input: {
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
      readonly stderr: string;
    }) => void;
  }): Promise<PiRpcProcess> {
    const launcher = resolvePiLauncherInvocation({
      ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
      ...(typeof input.enableAutoreason === "boolean"
        ? { enableAutoreason: input.enableAutoreason }
        : {}),
      ...(typeof input.fullAutonomy === "boolean" ? { fullAutonomy: input.fullAutonomy } : {}),
    });
    await FS.promises.mkdir(Path.dirname(input.sessionFile), { recursive: true });

    const preparedEnv = await prepareEmbeddedPiLauncherEnv(input.env);
    const child = ChildProcess.spawn(
      launcher.binaryPath,
      [...launcher.args, "--mode", "rpc", "--session", input.sessionFile],
      {
        cwd: input.cwd,
        env: {
          ...process.env,
          ...preparedEnv,
        },
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );

    const instance = new PiRpcProcess({
      process: child,
      onEvent: input.onEvent ?? (() => undefined),
      ...(input.onExit ? { onExit: input.onExit } : {}),
    });

    await instance.getState();
    return instance;
  }

  async getState(): Promise<PiRpcSessionState> {
    return this.sendCommand<PiRpcSessionState>({ type: "get_state" }, "get_state");
  }

  async getAvailableModels(): Promise<ReadonlyArray<PiRpcModel>> {
    const response = await this.sendCommand<{ models: PiRpcModel[] }>(
      { type: "get_available_models" },
      "get_available_models",
    );
    return response.models;
  }

  async getCommands(): Promise<ReadonlyArray<PiRpcSlashCommand>> {
    const response = await this.sendCommand<{ commands: PiRpcSlashCommand[] }>(
      { type: "get_commands" },
      "get_commands",
    );
    return response.commands;
  }

  async prompt(input: {
    readonly message: string;
    readonly images?: ReadonlyArray<PiRpcPromptImage>;
    readonly streamingBehavior?: "steer" | "followUp";
  }): Promise<void> {
    await this.sendCommand<void>(
      {
        type: "prompt",
        message: input.message,
        ...(input.images && input.images.length > 0 ? { images: [...input.images] } : {}),
        ...(input.streamingBehavior ? { streamingBehavior: input.streamingBehavior } : {}),
      },
      "prompt",
    );
  }

  async abort(): Promise<void> {
    await this.sendCommand<void>({ type: "abort" }, "abort");
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    await this.sendCommand<void>({ type: "set_model", provider, modelId }, "set_model");
  }

  async setThinkingLevel(level: PiThinkingLevel): Promise<void> {
    await this.sendCommand<void>({ type: "set_thinking_level", level }, "set_thinking_level");
  }

  async setSteeringMode(mode: "all" | "one-at-a-time"): Promise<void> {
    await this.sendCommand<void>({ type: "set_steering_mode", mode }, "set_steering_mode");
  }

  async setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<void> {
    await this.sendCommand<void>({ type: "set_follow_up_mode", mode }, "set_follow_up_mode");
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    await this.sendCommand<void>({ type: "set_auto_compaction", enabled }, "set_auto_compaction");
  }

  async setSessionName(name: string | null): Promise<void> {
    await this.sendCommand<void>(
      { type: "set_session_name", name: name ?? "" },
      "set_session_name",
    );
  }

  async compact(customInstructions?: string): Promise<{ summary?: string } | undefined> {
    return this.sendCommand<{ summary?: string } | undefined>(
      {
        type: "compact",
        ...(customInstructions ? { customInstructions } : {}),
      },
      "compact",
    );
  }

  async getSessionStats(): Promise<PiRpcSessionStats> {
    return this.sendCommand<PiRpcSessionStats>({ type: "get_session_stats" }, "get_session_stats");
  }

  async sendExtensionUiResponse(response: Record<string, unknown>): Promise<void> {
    this.writeLine(response);
  }

  async close(timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS): Promise<void> {
    if (this.closed) {
      return;
    }

    this.process.stdin.end();
    const timeout = new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        if (!this.closed) {
          this.process.kill("SIGTERM");
        }
        resolve();
      }, timeoutMs);
    });

    await Promise.race([this.exitPromise, timeout]);
    await this.exitPromise.catch(() => undefined);
  }

  private async handleLine(line: string): Promise<void> {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedLine);
    } catch {
      return;
    }

    if (isPiRpcResponse(parsed)) {
      this.handleResponse(parsed);
      return;
    }

    if (isPiRpcEvent(parsed)) {
      this.onEvent(parsed);
    }
  }

  private handleResponse(response: PiRpcResponse<unknown>): void {
    const id = response.id;
    if (!id) {
      return;
    }
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    if (!response.success) {
      pending.reject(new Error(response.error));
      return;
    }
    pending.resolve(response.data);
  }

  private async sendCommand<T>(
    payload: Record<string, unknown>,
    commandName: string,
    timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  ): Promise<T> {
    if (this.closed) {
      throw new Error(`pi RPC process is closed; cannot run '${commandName}'.`);
    }

    const id = `pi_rpc_${++this.requestId}`;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for pi RPC response to '${commandName}'.`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        command: commandName,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      this.writeLine({ ...payload, id });
    });
  }

  private writeLine(payload: Record<string, unknown>): void {
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

export async function probePiVersion(input: {
  readonly binaryPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly enableAutoreason?: boolean;
}): Promise<string | null> {
  const launcher = resolvePiLauncherInvocation({
    binaryPath: input.binaryPath,
    ...(typeof input.enableAutoreason === "boolean"
      ? { enableAutoreason: input.enableAutoreason }
      : {}),
  });
  const preparedEnv = await prepareEmbeddedPiLauncherEnv(input.env);
  return new Promise<string | null>((resolve, reject) => {
    const child = ChildProcess.spawn(launcher.binaryPath, [...launcher.args, "--version"], {
      cwd: OS.homedir(),
      env: {
        ...process.env,
        ...preparedEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if ((code ?? 1) !== 0) {
        reject(
          new Error(stderr.trim() || stdout.trim() || `pi --version exited with code ${code}`),
        );
        return;
      }
      resolve(parsePiVersion(stdout) ?? parsePiVersion(stderr));
    });
  });
}

export async function probePiModels(input: {
  readonly binaryPath?: string;
  readonly enableAutoreason?: boolean;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ReadonlyArray<PiRpcModel>> {
  const sessionFile = Path.join(
    OS.tmpdir(),
    `pi-model-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  const process = await PiRpcProcess.start({
    ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
    ...(typeof input.enableAutoreason === "boolean"
      ? { enableAutoreason: input.enableAutoreason }
      : {}),
    cwd: input.cwd,
    sessionFile,
    ...(input.env ? { env: input.env } : {}),
  });
  try {
    return await process.getAvailableModels();
  } finally {
    await process.close().catch(() => undefined);
    await FS.promises.rm(sessionFile, { force: true }).catch(() => undefined);
  }
}

export async function probePiCommands(input: {
  readonly binaryPath?: string;
  readonly enableAutoreason?: boolean;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ReadonlyArray<PiRpcSlashCommand>> {
  const sessionFile = Path.join(
    OS.tmpdir(),
    `pi-command-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  const process = await PiRpcProcess.start({
    ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
    ...(typeof input.enableAutoreason === "boolean"
      ? { enableAutoreason: input.enableAutoreason }
      : {}),
    cwd: input.cwd,
    sessionFile,
    ...(input.env ? { env: input.env } : {}),
  });
  try {
    return await process.getCommands();
  } finally {
    await process.close().catch(() => undefined);
    await FS.promises.rm(sessionFile, { force: true }).catch(() => undefined);
  }
}
