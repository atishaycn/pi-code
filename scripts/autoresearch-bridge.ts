#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const defaultAutoresearchRepo = "/tmp/autoresearch";

interface BridgeOptions {
  readonly repo: string;
  readonly artifactDir: string;
  readonly programFile: string;
  readonly contextFile: string;
  readonly runnerCommand: string | null;
}

function parseOptions(): BridgeOptions {
  const artifactDir = process.env.AUTORESEARCH_ARTIFACT_DIR?.trim();
  const programFile = process.env.AUTORESEARCH_PROGRAM_FILE?.trim();
  const contextFile = process.env.AUTORESEARCH_CONTEXT_FILE?.trim();

  if (!artifactDir || !programFile || !contextFile) {
    throw new Error(
      "AUTORESEARCH_ARTIFACT_DIR, AUTORESEARCH_PROGRAM_FILE, and AUTORESEARCH_CONTEXT_FILE are required.",
    );
  }

  return {
    repo: process.env.AUTORESEARCH_EXTERNAL_REPO?.trim() || defaultAutoresearchRepo,
    artifactDir,
    programFile,
    contextFile,
    runnerCommand: process.env.AUTORESEARCH_AGENT_COMMAND?.trim() || null,
  };
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, value: string): void {
  writeFileSync(path, value);
}

function runShellCommand(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd,
      env,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code ?? "unknown"}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function main(): Promise<void> {
  const options = parseOptions();
  const bridgeDir = join(options.artifactDir, "autoresearch-bridge");
  ensureDir(bridgeDir);

  const handoff = [
    "# T3 Code automation handoff for autoresearch",
    "",
    `- Repo under improvement: ${repoRoot}`,
    `- Latest artifact dir: ${options.artifactDir}`,
    `- Program file: ${options.programFile}`,
    `- Context file: ${options.contextFile}`,
    "",
    "Read both files, inspect the desktop artifacts, then propose or apply one bounded improvement to the automation loop.",
    "",
    "Targets:",
    "- stronger processing-state assertions",
    "- steer/queue coverage",
    "- richer failure artifacts",
    "- no silent hangs",
    "",
  ].join("\n");

  writeText(join(bridgeDir, "handoff.md"), handoff);

  if (!existsSync(options.repo)) {
    writeText(
      join(bridgeDir, "status.txt"),
      `Autoresearch repo not found at ${options.repo}. Bridge artifacts prepared only.\n`,
    );
    return;
  }

  const targetDir = join(options.repo, "runs", "t3code-automation", "latest");
  ensureDir(targetDir);
  cpSync(options.programFile, join(targetDir, "program.md"));
  cpSync(options.contextFile, join(targetDir, "context.md"));
  cpSync(join(bridgeDir, "handoff.md"), join(targetDir, "handoff.md"));

  writeText(
    join(bridgeDir, "status.txt"),
    [
      `Synced autoresearch inputs into ${targetDir}.`,
      options.runnerCommand
        ? `Runner command configured: ${options.runnerCommand}`
        : "No AUTORESEARCH_AGENT_COMMAND configured; sync-only mode.",
      "",
    ].join("\n"),
  );

  if (!options.runnerCommand) {
    return;
  }

  await runShellCommand(options.runnerCommand, options.repo, {
    ...process.env,
    AUTORESEARCH_T3CODE_RUN_DIR: targetDir,
    AUTORESEARCH_T3CODE_REPO: repoRoot,
    AUTORESEARCH_T3CODE_ARTIFACT_DIR: options.artifactDir,
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
