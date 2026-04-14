#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

function runStep(step: Step): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    console.log(`\n▶ ${step.label}`);
    console.log(`$ ${step.command} ${step.args.join(" ")}`);

    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`${step.label} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`${step.label} exited with code ${code ?? "unknown"}`));
        return;
      }
      const durationMs = Date.now() - startedAt;
      console.log(`✓ ${step.label} (${durationMs}ms)`);
      resolvePromise();
    });
  });
}

async function main(): Promise<void> {
  const steps: readonly Step[] = [
    {
      label: "Targeted chat/sidebar state tests",
      command: "bun",
      args: [
        "run",
        "test",
        "src/components/Sidebar.logic.test.ts",
        "src/components/ChatView.logic.test.ts",
        "src/components/chat/ComposerPrimaryActions.test.tsx",
      ],
      cwd: resolve(repoRoot, "apps/web"),
    },
    {
      label: "Formatting",
      command: "bun",
      args: ["fmt"],
      cwd: repoRoot,
    },
    {
      label: "Lint",
      command: "bun",
      args: ["lint"],
      cwd: repoRoot,
    },
    {
      label: "Typecheck",
      command: "bun",
      args: ["typecheck"],
      cwd: repoRoot,
    },
  ];

  for (const step of steps) {
    await runStep(step);
  }

  console.log(
    "\nUI validation passed: sidebar Working/Completed states and chat Send/Steer controls are covered.",
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
