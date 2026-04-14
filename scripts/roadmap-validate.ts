import * as ChildProcess from "node:child_process";
import * as FS from "node:fs/promises";
import * as Path from "node:path";

interface ValidationCheckResult {
  readonly id: "fmt" | "lint" | "typecheck" | "test";
  readonly label: string;
  readonly status: "pass" | "fail";
  readonly detail?: string;
  readonly updatedAt: string;
  readonly durationMs: number;
}

const checks = [
  { id: "fmt", label: "bun fmt", command: "bun", args: ["fmt"] },
  { id: "lint", label: "bun lint", command: "bun", args: ["lint"] },
  { id: "typecheck", label: "bun typecheck", command: "bun", args: ["typecheck"] },
  { id: "test", label: "bun run test", command: "bun", args: ["run", "test"] },
] as const;

async function runCheck(input: (typeof checks)[number]): Promise<ValidationCheckResult> {
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    const child = ChildProcess.spawn(input.command, input.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    child.on("close", (code, signal) => {
      const updatedAt = new Date().toISOString();
      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve({
          id: input.id,
          label: input.label,
          status: "pass",
          updatedAt,
          durationMs,
        });
        return;
      }

      resolve({
        id: input.id,
        label: input.label,
        status: "fail",
        detail:
          code !== null
            ? `${input.label} exited with code ${code}`
            : `${input.label} terminated by signal ${signal ?? "unknown"}`,
        updatedAt,
        durationMs,
      });
    });
  });
}

async function main() {
  const results: ValidationCheckResult[] = [];
  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    if (result.status === "fail") {
      break;
    }
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    generatedAt,
    checks: results,
  };

  const artifactDir = Path.join(process.cwd(), ".artifacts", "roadmap", "validation");
  await FS.mkdir(artifactDir, { recursive: true });
  const timestamp = generatedAt.replaceAll(":", "-");
  const timestampedPath = Path.join(artifactDir, `${timestamp}.json`);
  const latestPath = Path.join(process.cwd(), ".artifacts", "roadmap", "latest-validation.json");
  await FS.writeFile(timestampedPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  await FS.mkdir(Path.dirname(latestPath), { recursive: true });
  await FS.writeFile(latestPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

  if (results.every((result) => result.status === "pass") && results.length === checks.length) {
    console.log(`\nRoadmap validation artifact written to ${latestPath}`);
    return;
  }

  process.exitCode = 1;
}

void main();
