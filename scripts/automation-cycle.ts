#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const defaultAutoresearchCommand = "node scripts/autoresearch-bridge.ts";
const defaultPrompt =
  "Inspect this repo and summarize where Pi runtime integration and processing-state UI live. Use repo tools if needed.";

interface AutomationCycleOptions {
  readonly prompt: string;
  readonly steerPrompt: string;
  readonly artifactDir: string;
  readonly skipBuild: boolean;
  readonly autoresearchCommand: string | null;
  readonly scenario: "basic" | "steer-queue";
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv: ReadonlyArray<string>): AutomationCycleOptions {
  let prompt = defaultPrompt;
  let steerPrompt =
    "Actually focus on ChatView processing states and queued follow-up behavior. Use repo tools if needed.";
  let artifactDir = resolve(repoRoot, ".artifacts", "automation-cycle", timestampSlug());
  let skipBuild = false;
  let autoresearchCommand = process.env.AUTORESEARCH_COMMAND?.trim() || defaultAutoresearchCommand;
  let scenario: "basic" | "steer-queue" = "steer-queue";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prompt") {
      prompt = argv[index + 1] ?? prompt;
      index += 1;
      continue;
    }
    if (arg === "--artifact-dir") {
      artifactDir = resolve(argv[index + 1] ?? artifactDir);
      index += 1;
      continue;
    }
    if (arg === "--steer-prompt") {
      steerPrompt = argv[index + 1] ?? steerPrompt;
      index += 1;
      continue;
    }
    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }
    if (arg === "--autoresearch-command") {
      autoresearchCommand = argv[index + 1] ?? autoresearchCommand;
      index += 1;
      continue;
    }
    if (arg === "--scenario") {
      const nextScenario = argv[index + 1];
      if (nextScenario === "basic" || nextScenario === "steer-queue") {
        scenario = nextScenario;
      }
      index += 1;
    }
  }

  return { prompt, steerPrompt, artifactDir, skipBuild, autoresearchCommand, scenario };
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, value: string): void {
  writeFileSync(path, value);
}

function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
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

function runShellCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
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

async function maybeRunAutoresearch(
  options: Pick<
    AutomationCycleOptions,
    "autoresearchCommand" | "artifactDir" | "prompt" | "steerPrompt" | "scenario"
  >,
): Promise<void> {
  const promptFile = resolve(repoRoot, ".automation", "program.md");
  const contextFile = join(options.artifactDir, "autoresearch-context.md");
  writeText(
    contextFile,
    [
      "# Automation cycle context",
      "",
      `- Repo: ${repoRoot}`,
      `- Artifact dir: ${options.artifactDir}`,
      `- Program file: ${promptFile}`,
      "- Goal: improve reliable desktop automation without getting stuck.",
      "- Inputs: screenshots, page HTML/text, summary.json, page-console.json, error.json if present.",
      "- Constraints: preserve real Pi desktop behavior, keep changes maintainable, run bun fmt/lint/typecheck after code changes.",
      "",
      `- Scenario: ${options.scenario}`,
      `- Prompt: ${options.prompt}`,
      `- Steer prompt: ${options.steerPrompt}`,
      "Read the program file, then inspect the artifact dir and propose the next small automation improvement.",
      "Default bridge command syncs this bundle into /tmp/autoresearch when that repo exists.",
      "",
    ].join("\n"),
  );

  if (!options.autoresearchCommand) {
    console.log(`Autoresearch command not configured. Context written to ${contextFile}`);
    return;
  }

  await runShellCommand(options.autoresearchCommand, repoRoot, {
    ...process.env,
    AUTORESEARCH_REPO: repoRoot,
    AUTORESEARCH_ARTIFACT_DIR: options.artifactDir,
    AUTORESEARCH_PROGRAM_FILE: promptFile,
    AUTORESEARCH_CONTEXT_FILE: contextFile,
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.artifactDir);

  if (!options.skipBuild) {
    await runCommand("bun", ["run", "build:desktop"], repoRoot);
  }

  const desktopArtifactDir = join(options.artifactDir, "desktop");
  ensureDir(desktopArtifactDir);
  await runCommand(
    "node",
    [
      "scripts/desktop-automation.ts",
      "--artifact-dir",
      desktopArtifactDir,
      "--prompt",
      options.prompt,
      "--steer-prompt",
      options.steerPrompt,
      "--scenario",
      options.scenario,
    ],
    repoRoot,
  );

  await maybeRunAutoresearch(options);
  console.log(`Automation cycle finished. Artifacts: ${options.artifactDir}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
