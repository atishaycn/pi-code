import * as FS from "node:fs/promises";
import * as Path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  DoctorReport,
  type PiDiagnostic,
  type ServerProvider,
  ServerSettings,
} from "@t3tools/contracts";
import { Schema } from "effect";

import { resolvePiWorkspaceRoots } from "./piWorkspace";

const execFile = promisify(execFileCallback);

const decodeServerSettingsJson = Schema.decodeUnknownSync(ServerSettings);
const decodeDoctorReport = Schema.decodeUnknownSync(DoctorReport);

const DIAGNOSTIC_SEVERITY_ORDER: Record<PiDiagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export interface GeneratePiDoctorReportInput {
  readonly cwd: string;
  readonly settingsPath: string;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly piHomePath?: string | null;
  readonly commandExists?: (command: string) => Promise<boolean>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await FS.access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(root: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];

  async function visit(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: Array<{ isDirectory(): boolean; isFile(): boolean; name: string }> = [];
    try {
      entries = await FS.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = Path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, depth + 1);
        continue;
      }
      if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }

  await visit(root, 0);
  return results;
}

async function defaultCommandExists(command: string): Promise<boolean> {
  try {
    await execFile("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

function makeDiagnostic(input: PiDiagnostic): PiDiagnostic {
  return input;
}

async function collectJsonFileDiagnostic(input: {
  readonly filePath: string;
  readonly category: PiDiagnostic["category"];
  readonly id: string;
  readonly summary: string;
  readonly detailPrefix: string;
  readonly validator?: (raw: string) => void;
  readonly fixHint?: string;
}): Promise<PiDiagnostic[]> {
  if (!(await pathExists(input.filePath))) {
    return [];
  }

  try {
    const raw = await FS.readFile(input.filePath, "utf8");
    if (input.validator) {
      input.validator(raw);
    } else {
      JSON.parse(raw);
    }
    return [];
  } catch (error) {
    return [
      makeDiagnostic({
        id: input.id,
        category: input.category,
        severity: "error",
        summary: input.summary,
        detail: `${input.detailPrefix}: ${error instanceof Error ? error.message : String(error)}`,
        fixable: true,
        ...(input.fixHint ? { fixHint: input.fixHint } : {}),
        filePaths: [input.filePath],
      }),
    ];
  }
}

async function collectSessionDiagnostics(sessionRoot: string): Promise<PiDiagnostic[]> {
  if (!(await pathExists(sessionRoot))) {
    return [];
  }

  const diagnostics: PiDiagnostic[] = [];
  const files = await listFilesRecursively(sessionRoot, 2);
  for (const filePath of files) {
    const ext = Path.extname(filePath).toLowerCase();
    if (ext === ".json") {
      diagnostics.push(
        ...(await collectJsonFileDiagnostic({
          filePath,
          category: "sessions",
          id: "sessions.corrupt-json",
          summary: "Session file is not valid JSON",
          detailPrefix: "Failed to parse session JSON",
          fixHint: "Restore the session file from backup or remove the corrupt file.",
        })),
      );
      continue;
    }

    if (ext === ".jsonl" || filePath.endsWith(".ndjson")) {
      try {
        const raw = await FS.readFile(filePath, "utf8");
        const lines = raw
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);
        for (const [index, line] of lines.entries()) {
          JSON.parse(line);
          if (index > 250) break;
        }
      } catch (error) {
        diagnostics.push(
          makeDiagnostic({
            id: "sessions.corrupt-jsonl",
            category: "sessions",
            severity: "error",
            summary: "Session event log is corrupt",
            detail: `${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            fixable: true,
            fixHint: "Restore the session log from backup or remove the corrupt file.",
            filePaths: [filePath],
          }),
        );
      }
    }
  }

  return diagnostics;
}

async function collectToolDiagnostics(
  commandExists: (command: string) => Promise<boolean>,
): Promise<PiDiagnostic[]> {
  const requiredCommands = ["git", "rg", "bash", "node", "bun"] as const;
  const diagnostics: PiDiagnostic[] = [];

  for (const command of requiredCommands) {
    if (await commandExists(command)) {
      continue;
    }
    diagnostics.push(
      makeDiagnostic({
        id: `tools.${command}.missing`,
        category: "tools",
        severity: "error",
        summary: `${command} is missing from PATH`,
        detail: `Pi coding flows rely on ${command} for repository work, shell execution, or verification.`,
        fixable: false,
        fixHint: `Install ${command} and retry pi doctor before unattended coding runs.`,
      }),
    );
  }

  return diagnostics;
}

function collectProviderDiagnostics(providers: ReadonlyArray<ServerProvider>): PiDiagnostic[] {
  const diagnostics: PiDiagnostic[] = [];

  for (const provider of providers) {
    if (!provider.enabled) {
      continue;
    }

    if (!provider.installed) {
      diagnostics.push(
        makeDiagnostic({
          id: `tools.${provider.provider}.binary-missing`,
          category: "tools",
          severity: "error",
          summary: `${provider.provider} binary is unavailable`,
          detail: provider.message ?? `${provider.provider} CLI is not installed or not on PATH.`,
          fixable: false,
          fixHint: `Install ${provider.provider} CLI or update its configured binary path.`,
        }),
      );
    }

    if (provider.auth.status === "unauthenticated") {
      diagnostics.push(
        makeDiagnostic({
          id: `auth.${provider.provider}.missing`,
          category: "auth",
          severity: "warning",
          summary: `${provider.provider} is not authenticated`,
          detail:
            provider.message ??
            `Provider is enabled but current auth state is unusable for coding and autonomous runs.`,
          fixable: false,
          fixHint: `Authenticate ${provider.provider} before starting unattended coding sessions.`,
        }),
      );
    }
  }

  return diagnostics;
}

function sortDiagnostics(diagnostics: ReadonlyArray<PiDiagnostic>): PiDiagnostic[] {
  return [...diagnostics].toSorted((left, right) => {
    const severityDelta =
      DIAGNOSTIC_SEVERITY_ORDER[left.severity] - DIAGNOSTIC_SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const categoryDelta = left.category.localeCompare(right.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    const idDelta = left.id.localeCompare(right.id);
    if (idDelta !== 0) {
      return idDelta;
    }

    return (left.filePaths?.[0] ?? "").localeCompare(right.filePaths?.[0] ?? "");
  });
}

function buildSummary(diagnostics: ReadonlyArray<PiDiagnostic>): DoctorReport["summary"] {
  let info = 0;
  let warning = 0;
  let error = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "info") {
      info += 1;
      continue;
    }
    if (diagnostic.severity === "warning") {
      warning += 1;
      continue;
    }
    error += 1;
  }

  return {
    total: diagnostics.length,
    info,
    warning,
    error,
  };
}

export async function generatePiDoctorReport(
  input: GeneratePiDoctorReportInput,
): Promise<DoctorReport> {
  const roots = resolvePiWorkspaceRoots({
    cwd: input.cwd,
    ...(input.piHomePath !== undefined ? { piHomePath: input.piHomePath } : {}),
  });
  const commandExists = input.commandExists ?? defaultCommandExists;

  const diagnostics = [
    ...(await collectJsonFileDiagnostic({
      filePath: input.settingsPath,
      category: "settings",
      id: "settings.server.invalid",
      summary: "Server settings.json is invalid",
      detailPrefix: "Failed to parse server settings",
      validator: (raw) => {
        decodeServerSettingsJson(JSON.parse(raw));
      },
      fixHint: "Rewrite the server settings file with valid JSON and supported settings keys.",
    })),
    ...(await collectJsonFileDiagnostic({
      filePath: Path.join(roots.globalRoot, "settings.json"),
      category: "settings",
      id: "settings.pi-global.invalid",
      summary: "Global Pi settings.json is invalid",
      detailPrefix: "Failed to parse global Pi settings",
      fixHint: "Repair ~/.pi/agent/settings.json or remove the broken file.",
    })),
    ...(await collectJsonFileDiagnostic({
      filePath: Path.join(roots.projectRoot, "settings.json"),
      category: "settings",
      id: "settings.pi-project.invalid",
      summary: "Project Pi settings.json is invalid",
      detailPrefix: "Failed to parse project Pi settings",
      fixHint: "Repair .pi/settings.json in the project or remove the broken file.",
    })),
    ...(await collectJsonFileDiagnostic({
      filePath: Path.join(roots.globalRoot, "models.json"),
      category: "models",
      id: "models.global.invalid",
      summary: "Global models.json is invalid",
      detailPrefix: "Failed to parse global models.json",
      fixHint: "Repair ~/.pi/agent/models.json or remove the broken file.",
    })),
    ...(await collectJsonFileDiagnostic({
      filePath: Path.join(roots.projectRoot, "models.json"),
      category: "models",
      id: "models.project.invalid",
      summary: "Project models.json is invalid",
      detailPrefix: "Failed to parse project models.json",
      fixHint: "Repair .pi/models.json in the project or remove the broken file.",
    })),
    ...(await collectSessionDiagnostics(Path.join(roots.globalRoot, "sessions"))),
    ...(await collectSessionDiagnostics(Path.join(roots.projectRoot, "sessions"))),
    ...(await collectToolDiagnostics(commandExists)),
    ...collectProviderDiagnostics(input.providers),
  ];

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const summary = buildSummary(sortedDiagnostics);

  return decodeDoctorReport({
    version: 1,
    ok: summary.error === 0,
    generatedAt: new Date().toISOString(),
    summary,
    diagnostics: sortedDiagnostics,
  });
}
