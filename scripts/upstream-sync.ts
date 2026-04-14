#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const defaultArtifactDir = resolve(repoRoot, ".artifacts", "upstream-sync", timestampSlug());
const manifestPath = resolve(repoRoot, ".upstream-sync", "manifest.json");
const tempRoot = resolve(repoRoot, ".artifacts", ".tmp", "upstream-sync");

const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  ".artifacts",
  "node_modules",
  "dist",
  "dist-electron",
  "release",
  "coverage",
]);

const ignoredFiles = new Set(["package-lock.json"]);

type SourceMode = "auto" | "local" | "remote";
type CommandName = "bootstrap" | "check" | "apply";

type UpstreamName = "pi-mono" | "t3code";

interface UpstreamSource {
  readonly name: UpstreamName;
  readonly localPath: string;
  readonly localRemoteName: string;
  readonly remoteUrl: string;
  readonly ref: string;
  readonly preferred: boolean;
}

interface ManifestFileEntry {
  readonly path: string;
  readonly owner: UpstreamName;
  readonly baselineHash: string;
}

interface UpstreamManifest {
  readonly version: 1;
  readonly generatedAt: string;
  readonly generatedFromMode: SourceMode;
  readonly sources: Record<UpstreamName, { readonly commit: string; readonly ref: string }>;
  readonly files: ReadonlyArray<ManifestFileEntry>;
}

interface CliOptions {
  readonly command: CommandName;
  readonly sourceMode: SourceMode;
  readonly artifactDir: string;
  readonly manifestPath: string;
}

interface ResolvedSource {
  readonly config: UpstreamSource;
  readonly root: string;
  readonly commit: string;
}

interface CheckSummary {
  readonly generatedAt: string;
  readonly sourceMode: SourceMode;
  readonly manifestPath: string;
  readonly artifactDir: string;
  readonly sources: Record<UpstreamName, { readonly commit: string; readonly ref: string }>;
  readonly totals: {
    readonly trackedFiles: number;
    readonly safeUpdates: number;
    readonly conflicts: number;
    readonly localOnlyDrift: number;
    readonly sourceMissing: number;
    readonly targetMissing: number;
    readonly unchanged: number;
  };
  readonly safeUpdates: ReadonlyArray<string>;
  readonly conflicts: ReadonlyArray<string>;
  readonly localOnlyDrift: ReadonlyArray<string>;
  readonly sourceMissing: ReadonlyArray<string>;
  readonly targetMissing: ReadonlyArray<string>;
}

const upstreams: ReadonlyArray<UpstreamSource> = [
  {
    name: "t3code",
    localPath: process.env.UPSTREAM_T3CODE_PATH?.trim() || "/Users/suns/Developer/t3code",
    localRemoteName: process.env.UPSTREAM_T3CODE_REMOTE?.trim() || "upstream",
    remoteUrl: process.env.UPSTREAM_T3CODE_URL?.trim() || "https://github.com/pingdotgg/t3code.git",
    ref: process.env.UPSTREAM_T3CODE_REF?.trim() || "main",
    preferred: true,
  },
  {
    name: "pi-mono",
    localPath: process.env.UPSTREAM_PI_MONO_PATH?.trim() || "/Users/suns/Developer/pi-mono",
    localRemoteName: process.env.UPSTREAM_PI_MONO_REMOTE?.trim() || "origin",
    remoteUrl:
      process.env.UPSTREAM_PI_MONO_URL?.trim() || "https://github.com/badlogic/pi-mono.git",
    ref: process.env.UPSTREAM_PI_MONO_REF?.trim() || "main",
    preferred: false,
  },
] as const;

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  const command = (argv[0] as CommandName | undefined) ?? "check";
  let sourceMode: SourceMode = "auto";
  let artifactDir = defaultArtifactDir;
  let currentManifestPath = manifestPath;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-mode") {
      const nextValue = argv[index + 1];
      if (nextValue === "auto" || nextValue === "local" || nextValue === "remote") {
        sourceMode = nextValue;
      }
      index += 1;
      continue;
    }
    if (arg === "--artifact-dir") {
      artifactDir = resolve(argv[index + 1] ?? artifactDir);
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      currentManifestPath = resolve(argv[index + 1] ?? currentManifestPath);
      index += 1;
    }
  }

  if (command !== "bootstrap" && command !== "check" && command !== "apply") {
    throw new Error(`Unknown command: ${command}`);
  }

  return {
    command,
    sourceMode,
    artifactDir,
    manifestPath: currentManifestPath,
  };
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashFile(path: string): string {
  return hashContent(readFileSync(path, "utf8"));
}

function isIgnoredPath(root: string, candidatePath: string, isDirectory: boolean): boolean {
  const rel = relative(root, candidatePath);
  if (!rel || rel.startsWith("..")) return false;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => ignoredDirectories.has(part))) return true;
  if (!isDirectory && parts.length > 0 && ignoredFiles.has(parts.at(-1) ?? "")) return true;
  return false;
}

function walkFiles(root: string): ReadonlyArray<string> {
  const output: Array<string> = [];
  const queue: Array<string> = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = readdirSync(current, { withFileTypes: true }).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (isIgnoredPath(root, absolute, entry.isDirectory())) {
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      output.push(relative(root, absolute));
    }
  }

  output.sort((left, right) => left.localeCompare(right));
  return output;
}

function runGit(args: ReadonlyArray<string>, cwd: string): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed in ${cwd}`);
  }

  return result.stdout.trim();
}

function cloneRemoteSource(source: UpstreamSource): string {
  ensureDir(tempRoot);
  const clonePath = join(tempRoot, `${source.name}-${timestampSlug()}`);
  const result = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", source.ref, source.remoteUrl, clonePath],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    rmSync(clonePath, { recursive: true, force: true });
    throw new Error(result.stderr.trim() || `Unable to clone ${source.remoteUrl}`);
  }

  return clonePath;
}

function cloneLocalSourceAtConfiguredRef(source: UpstreamSource): {
  readonly root: string;
  readonly commit: string;
} {
  ensureDir(tempRoot);
  const clonePath = join(tempRoot, `${source.name}-local-${timestampSlug()}`);
  const cloneResult = spawnSync("git", ["clone", "--shared", source.localPath, clonePath], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (cloneResult.status !== 0) {
    rmSync(clonePath, { recursive: true, force: true });
    throw new Error(
      cloneResult.stderr.trim() || `Unable to clone local source ${source.localPath}`,
    );
  }

  const remoteNames = new Set(runGit(["remote"], clonePath).split(/\s+/).filter(Boolean));
  if (!remoteNames.has(source.localRemoteName)) {
    runGit(["remote", "add", source.localRemoteName, source.remoteUrl], clonePath);
  } else {
    runGit(["remote", "set-url", source.localRemoteName, source.remoteUrl], clonePath);
  }

  runGit(["fetch", source.localRemoteName, source.ref, "--depth", "1"], clonePath);
  const commit = runGit(["rev-parse", "FETCH_HEAD"], clonePath);
  runGit(["checkout", "--detach", "FETCH_HEAD"], clonePath);
  return { root: clonePath, commit };
}

function resolveSources(sourceMode: SourceMode): ReadonlyArray<ResolvedSource> {
  return upstreams.map((source) => {
    const useLocal =
      sourceMode === "local" ||
      (sourceMode === "auto" &&
        existsSync(source.localPath) &&
        statSync(source.localPath).isDirectory());

    if (useLocal) {
      const resolved = cloneLocalSourceAtConfiguredRef(source);
      return { config: source, root: resolved.root, commit: resolved.commit };
    }

    const root = cloneRemoteSource(source);
    const commit = runGit(["rev-parse", "HEAD"], root);
    return { config: source, root, commit };
  });
}

function cleanupResolvedSources(
  sources: ReadonlyArray<ResolvedSource>,
  _sourceMode: SourceMode,
): void {
  for (const source of sources) {
    if (source.root === source.config.localPath) continue;
    if (!source.root.startsWith(tempRoot)) continue;
    rmSync(source.root, { recursive: true, force: true });
  }
}

function buildBootstrapManifest(
  sources: ReadonlyArray<ResolvedSource>,
  sourceMode: SourceMode,
): UpstreamManifest {
  const files = walkFiles(repoRoot);
  const manifestFiles: Array<ManifestFileEntry> = [];

  for (const file of files) {
    const targetAbsolute = resolve(repoRoot, file);
    const targetContent = readFileSync(targetAbsolute, "utf8");
    const matchingOwners = sources
      .filter((source) => existsSync(resolve(source.root, file)))
      .filter((source) => readFileSync(resolve(source.root, file), "utf8") === targetContent)
      .toSorted((left, right) => Number(right.config.preferred) - Number(left.config.preferred));

    const owner = matchingOwners[0];
    if (!owner) continue;
    manifestFiles.push({
      path: file,
      owner: owner.config.name,
      baselineHash: hashContent(targetContent),
    });
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedFromMode: sourceMode,
    sources: Object.fromEntries(
      sources.map((source) => [
        source.config.name,
        { commit: source.commit, ref: source.config.ref },
      ]),
    ) as UpstreamManifest["sources"],
    files: manifestFiles,
  };
}

function buildCheckSummary(
  manifest: UpstreamManifest,
  sources: ReadonlyArray<ResolvedSource>,
  options: Pick<CliOptions, "artifactDir" | "manifestPath" | "sourceMode">,
): CheckSummary {
  const sourcesByName = new Map(sources.map((source) => [source.config.name, source]));
  const safeUpdates: Array<string> = [];
  const conflicts: Array<string> = [];
  const localOnlyDrift: Array<string> = [];
  const sourceMissing: Array<string> = [];
  const targetMissing: Array<string> = [];
  let unchanged = 0;

  for (const entry of manifest.files) {
    const source = sourcesByName.get(entry.owner);
    if (!source) {
      sourceMissing.push(entry.path);
      continue;
    }

    const targetPath = resolve(repoRoot, entry.path);
    const sourcePath = resolve(source.root, entry.path);

    const hasTarget = existsSync(targetPath);
    const hasSource = existsSync(sourcePath);

    if (!hasTarget) {
      targetMissing.push(entry.path);
      continue;
    }

    if (!hasSource) {
      sourceMissing.push(entry.path);
      continue;
    }

    const currentTargetHash = hashFile(targetPath);
    const currentSourceHash = hashFile(sourcePath);
    const targetChanged = currentTargetHash !== entry.baselineHash;
    const sourceChanged = currentSourceHash !== entry.baselineHash;

    if (!targetChanged && !sourceChanged) {
      unchanged += 1;
      continue;
    }

    if (!targetChanged && sourceChanged) {
      safeUpdates.push(entry.path);
      continue;
    }

    if (targetChanged && !sourceChanged) {
      localOnlyDrift.push(entry.path);
      continue;
    }

    conflicts.push(entry.path);
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceMode: options.sourceMode,
    manifestPath: options.manifestPath,
    artifactDir: options.artifactDir,
    sources: Object.fromEntries(
      sources.map((source) => [
        source.config.name,
        { commit: source.commit, ref: source.config.ref },
      ]),
    ) as CheckSummary["sources"],
    totals: {
      trackedFiles: manifest.files.length,
      safeUpdates: safeUpdates.length,
      conflicts: conflicts.length,
      localOnlyDrift: localOnlyDrift.length,
      sourceMissing: sourceMissing.length,
      targetMissing: targetMissing.length,
      unchanged,
    },
    safeUpdates,
    conflicts,
    localOnlyDrift,
    sourceMissing,
    targetMissing,
  };
}

function writeSummaryArtifacts(summary: CheckSummary): void {
  ensureDir(summary.artifactDir);
  writeJson(join(summary.artifactDir, "summary.json"), summary);
  writeFileSync(
    join(summary.artifactDir, "summary.md"),
    [
      "# Upstream sync summary",
      "",
      `- Generated at: ${summary.generatedAt}`,
      `- Source mode: ${summary.sourceMode}`,
      `- Manifest: ${summary.manifestPath}`,
      `- Tracked files: ${summary.totals.trackedFiles}`,
      `- Safe updates: ${summary.totals.safeUpdates}`,
      `- Conflicts: ${summary.totals.conflicts}`,
      `- Local-only drift: ${summary.totals.localOnlyDrift}`,
      `- Missing upstream files: ${summary.totals.sourceMissing}`,
      `- Missing local files: ${summary.totals.targetMissing}`,
      "",
      "## Source commits",
      "",
      ...Object.entries(summary.sources).map(
        ([name, source]) => `- ${name}: ${source.commit} (${source.ref})`,
      ),
      "",
      "## Safe updates",
      "",
      ...(summary.safeUpdates.length > 0
        ? summary.safeUpdates.map((file) => `- ${file}`)
        : ["- none"]),
      "",
      "## Conflicts",
      "",
      ...(summary.conflicts.length > 0 ? summary.conflicts.map((file) => `- ${file}`) : ["- none"]),
      "",
      "## Local-only drift",
      "",
      ...(summary.localOnlyDrift.length > 0
        ? summary.localOnlyDrift.map((file) => `- ${file}`)
        : ["- none"]),
      "",
    ].join("\n"),
  );
}

function applySafeUpdates(
  manifest: UpstreamManifest,
  sources: ReadonlyArray<ResolvedSource>,
  summary: CheckSummary,
  currentManifestPath: string,
  sourceMode: SourceMode,
): UpstreamManifest {
  const safeUpdateSet = new Set(summary.safeUpdates);
  const sourcesByName = new Map(sources.map((source) => [source.config.name, source]));
  const nextFiles = manifest.files.map((entry) => {
    if (!safeUpdateSet.has(entry.path)) return entry;
    const source = sourcesByName.get(entry.owner);
    if (!source) return entry;
    const sourcePath = resolve(source.root, entry.path);
    const targetPath = resolve(repoRoot, entry.path);
    ensureDir(dirname(targetPath));
    cpSync(sourcePath, targetPath);
    return {
      ...entry,
      baselineHash: hashFile(targetPath),
    };
  });

  const nextManifest: UpstreamManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedFromMode: sourceMode,
    sources: Object.fromEntries(
      sources.map((source) => [
        source.config.name,
        { commit: source.commit, ref: source.config.ref },
      ]),
    ) as UpstreamManifest["sources"],
    files: nextFiles,
  };

  writeJson(currentManifestPath, nextManifest);
  return nextManifest;
}

function printSummary(summary: CheckSummary): void {
  console.log(`Tracked files: ${summary.totals.trackedFiles}`);
  console.log(`Safe updates: ${summary.totals.safeUpdates}`);
  console.log(`Conflicts: ${summary.totals.conflicts}`);
  console.log(`Local-only drift: ${summary.totals.localOnlyDrift}`);
  console.log(`Missing upstream files: ${summary.totals.sourceMissing}`);
  console.log(`Missing local files: ${summary.totals.targetMissing}`);
  console.log(`Artifacts: ${summary.artifactDir}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.artifactDir);

  const sources = resolveSources(options.sourceMode);
  try {
    if (options.command === "bootstrap") {
      const manifest = buildBootstrapManifest(sources, options.sourceMode);
      writeJson(options.manifestPath, manifest);
      console.log(
        `Wrote manifest with ${manifest.files.length} tracked files to ${options.manifestPath}`,
      );
      return;
    }

    if (!existsSync(options.manifestPath)) {
      throw new Error(
        `Manifest not found at ${options.manifestPath}. Run: node scripts/upstream-sync.ts bootstrap`,
      );
    }

    const manifest = readJson<UpstreamManifest>(options.manifestPath);
    const summary = buildCheckSummary(manifest, sources, options);
    writeSummaryArtifacts(summary);
    printSummary(summary);

    if (options.command === "apply") {
      const nextManifest = applySafeUpdates(
        manifest,
        sources,
        summary,
        options.manifestPath,
        options.sourceMode,
      );
      const nextSummary = buildCheckSummary(nextManifest, sources, options);
      writeSummaryArtifacts(nextSummary);
      console.log(`Applied ${summary.totals.safeUpdates} safe upstream updates.`);
      printSummary(nextSummary);
    }
  } finally {
    cleanupResolvedSources(sources, options.sourceMode);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
