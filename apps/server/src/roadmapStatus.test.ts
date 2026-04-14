import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getRoadmapStatus } from "./roadmapStatus";

const tempDirs: string[] = [];

async function createTempWorkspace() {
  const dir = await FS.mkdtemp(Path.join(OS.tmpdir(), "roadmap-status-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFile(root: string, relativePath: string, contents = "ok") {
  const absolutePath = Path.join(root, relativePath);
  await FS.mkdir(Path.dirname(absolutePath), { recursive: true });
  await FS.writeFile(absolutePath, contents, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => FS.rm(dir, { force: true, recursive: true })));
});

describe("getRoadmapStatus", () => {
  it("detects completed infra and contract subtasks from repo files", async () => {
    const cwd = await createTempWorkspace();
    await writeFile(cwd, "docs/t3code-feature-map.md");
    await writeFile(cwd, "docs/t3code-parity-delivery-plan.md");
    await writeFile(cwd, "docs/t3code-parity-scheduled-runbook.md");
    await writeFile(cwd, "apps/web/src/routes/roadmap.tsx");
    await writeFile(cwd, "apps/web/src/components/RoadmapDashboard.tsx");
    await writeFile(cwd, "apps/web/src/roadmap/roadmapLiveState.ts");
    await writeFile(
      cwd,
      "apps/web/src/components/Sidebar.tsx",
      'void navigate({ to: "/roadmap" })',
    );
    await writeFile(cwd, "apps/server/src/roadmapStatus.ts");
    await writeFile(cwd, "packages/contracts/src/auth.ts");
    await writeFile(cwd, "packages/contracts/src/environment.ts");
    await writeFile(cwd, "packages/contracts/src/auth.test.ts");
    await writeFile(cwd, "packages/contracts/src/environment.test.ts");

    const status = await getRoadmapStatus({ cwd });

    expect(status.infrastructure.every((check) => check.completed)).toBe(true);
    expect(
      status.subtasks.find((entry) => entry.subtaskId === "contracts-auth-port")?.completed,
    ).toBe(true);
    expect(
      status.subtasks.find((entry) => entry.subtaskId === "contracts-env-port")?.completed,
    ).toBe(true);
    expect(status.subtasks.find((entry) => entry.subtaskId === "contracts-tests")?.completed).toBe(
      true,
    );
  });

  it("reads validation results from the latest roadmap artifact", async () => {
    const cwd = await createTempWorkspace();
    await writeFile(
      cwd,
      ".artifacts/roadmap/latest-validation.json",
      JSON.stringify({
        generatedAt: "2026-04-13T20:00:00.000Z",
        checks: [
          { id: "fmt", label: "bun fmt", status: "pass", updatedAt: "2026-04-13T20:00:00.000Z" },
          { id: "lint", label: "bun lint", status: "fail", detail: "lint failed" },
        ],
      }),
    );

    const status = await getRoadmapStatus({ cwd });

    expect(status.validations.find((entry) => entry.id === "fmt")?.status).toBe("pass");
    expect(status.validations.find((entry) => entry.id === "lint")?.status).toBe("fail");
    expect(status.validations.find((entry) => entry.id === "typecheck")?.status).toBe("unknown");
  });
});
