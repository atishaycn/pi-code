import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getPiWorkspaceInventory,
  readPiResourceFile,
  resolvePiWorkspaceRoots,
  writePiResourceFile,
} from "./piWorkspace";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await FS.mkdtemp(Path.join(OS.tmpdir(), "t3code-pi-workspace-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => FS.rm(dir, { recursive: true, force: true })));
});

describe("piWorkspace", () => {
  it("lists fixed Pi config files, discovered resources, and installed package resources", async () => {
    const cwd = await makeTempDir();
    const piHome = await makeTempDir();

    await FS.mkdir(Path.join(cwd, ".pi", "prompts"), { recursive: true });
    await FS.mkdir(Path.join(cwd, ".pi", "skills", "debug-skill"), { recursive: true });
    await FS.mkdir(Path.join(cwd, ".pi", "extensions"), { recursive: true });
    await FS.mkdir(Path.join(piHome, "git", "github.com", "example", "pi-demo", "prompts"), {
      recursive: true,
    });
    await FS.mkdir(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "skills", "ship-it"),
      {
        recursive: true,
      },
    );
    await FS.writeFile(Path.join(cwd, "AGENTS.md"), "# Project instructions\n");
    await FS.writeFile(Path.join(cwd, ".pi", "prompts", "review.md"), "Review this change\n");
    await FS.writeFile(
      Path.join(cwd, ".pi", "skills", "debug-skill", "SKILL.md"),
      "---\nname: debug-skill\ndescription: Debug things\n---\n",
    );
    await FS.writeFile(Path.join(cwd, ".pi", "extensions", "hello.ts"), "export default {}\n");
    await FS.writeFile(
      Path.join(piHome, "settings.json"),
      JSON.stringify({ packages: ["https://github.com/example/pi-demo"] }),
    );
    await FS.writeFile(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "package.json"),
      JSON.stringify({
        name: "pi-demo",
        repository: { url: "https://github.com/example/pi-demo" },
        pi: {
          prompts: ["./prompts"],
          skills: ["./skills"],
        },
      }),
    );
    await FS.writeFile(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "prompts", "release.md"),
      "Ship the release\n",
    );
    await FS.writeFile(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "skills", "ship-it", "SKILL.md"),
      "---\nname: ship-it\ndescription: Ship confidently\n---\n",
    );

    const inventory = await getPiWorkspaceInventory({ cwd, piHomePath: piHome });
    const paths = inventory.resources.map((resource) => resource.path);

    expect(inventory.globalRoot).toBe(piHome);
    expect(inventory.projectRoot).toBe(Path.join(cwd, ".pi"));
    expect(paths).toContain(Path.join(piHome, "settings.json"));
    expect(paths).toContain(Path.join(cwd, "AGENTS.md"));
    expect(paths).toContain(Path.join(cwd, ".pi", "prompts", "review.md"));
    expect(paths).toContain(Path.join(cwd, ".pi", "skills", "debug-skill", "SKILL.md"));
    expect(paths).toContain(Path.join(cwd, ".pi", "extensions", "hello.ts"));
    expect(paths).toContain(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "prompts", "release.md"),
    );
    expect(paths).toContain(
      Path.join(piHome, "git", "github.com", "example", "pi-demo", "skills", "ship-it", "SKILL.md"),
    );
  });

  it("reads missing Pi resources as empty strings and writes new resources inside allowed roots", async () => {
    const cwd = await makeTempDir();
    const piHome = await makeTempDir();
    const roots = resolvePiWorkspaceRoots({ cwd, piHomePath: piHome });
    const target = Path.join(roots.projectRoot, "themes", "night.json");

    await expect(readPiResourceFile({ path: target, cwd, piHomePath: piHome })).resolves.toBe("");

    await writePiResourceFile({
      path: target,
      contents: '{"name":"night"}',
      cwd,
      piHomePath: piHome,
    });

    await expect(readPiResourceFile({ path: target, cwd, piHomePath: piHome })).resolves.toBe(
      '{"name":"night"}',
    );
  });

  it("rejects resource writes outside the allowed Pi roots", async () => {
    const cwd = await makeTempDir();
    const piHome = await makeTempDir();
    const outsidePath = Path.join(OS.tmpdir(), `outside-${Date.now()}.md`);

    await expect(
      writePiResourceFile({
        path: outsidePath,
        contents: "nope",
        cwd,
        piHomePath: piHome,
      }),
    ).rejects.toThrow(/outside the allowed workspace/i);
  });
});
