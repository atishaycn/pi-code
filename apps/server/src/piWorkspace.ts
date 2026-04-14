import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  ServerGetPiWorkspaceResult,
  ServerPiResourceEntry,
  ServerPiResourceKind,
  ServerPiResourceScope,
} from "@t3tools/contracts";

interface PiWorkspaceRoots {
  globalRoot: string;
  projectRoot: string;
  legacyGlobalSkillsRoot: string;
  legacyProjectSkillsRoot: string;
  cwd: string;
}

interface PiWorkspaceAccess {
  roots: PiWorkspaceRoots;
  resources: ServerPiResourceEntry[];
  allowedRoots: string[];
  allowedFiles: string[];
}

interface PiSettingsPackageFilter {
  source?: unknown;
}

interface PiSettingsFile {
  packages?: unknown;
  extensions?: unknown;
  skills?: unknown;
  prompts?: unknown;
  themes?: unknown;
}

interface PiInstalledPackage {
  root: string;
  scope: ServerPiResourceScope;
  label: string;
}

function normalizeRoot(root: string): string {
  return Path.resolve(root);
}

function normalizeAllowedPath(path: string): string {
  return normalizeRoot(path);
}

function expandHome(path: string): string {
  if (path === "~") {
    return OS.homedir();
  }
  if (path.startsWith(`~${Path.sep}`)) {
    return Path.join(OS.homedir(), path.slice(2));
  }
  return path;
}

function hasGlobSyntax(path: string): boolean {
  return /[*?[\]{}]/.test(path);
}

export function resolvePiWorkspaceRoots(input: {
  cwd: string;
  piHomePath?: string | null;
}): PiWorkspaceRoots {
  const globalRoot = normalizeRoot(
    input.piHomePath?.trim() || Path.join(OS.homedir(), ".pi", "agent"),
  );
  const cwd = normalizeRoot(input.cwd);
  return {
    globalRoot,
    projectRoot: Path.join(cwd, ".pi"),
    legacyGlobalSkillsRoot: Path.join(OS.homedir(), ".agents", "skills"),
    legacyProjectSkillsRoot: Path.join(cwd, ".agents", "skills"),
    cwd,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await FS.access(path);
    return true;
  } catch {
    return false;
  }
}

async function pathStat(path: string): Promise<Awaited<ReturnType<typeof FS.stat>> | null> {
  try {
    return await FS.stat(path);
  } catch {
    return null;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const contents = await FS.readFile(path, "utf8");
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

async function listDirectFiles(path: string, extensions: ReadonlySet<string>): Promise<string[]> {
  try {
    const entries = await FS.readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && extensions.has(Path.extname(entry.name).toLowerCase()))
      .map((entry) => Path.join(path, entry.name));
  } catch {
    return [];
  }
}

async function walkSkillFiles(path: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(dir: string, isRoot: boolean): Promise<void> {
    let entries;
    try {
      entries = await FS.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = Path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        if (await fileExists(Path.join(absolutePath, "SKILL.md"))) {
          results.push(Path.join(absolutePath, "SKILL.md"));
          continue;
        }
        await visit(absolutePath, false);
        continue;
      }
      if (isRoot && entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        results.push(absolutePath);
      }
    }
  }

  await visit(path, true);
  return results;
}

async function walkExtensions(path: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > 3) {
      return;
    }
    let entries;
    try {
      entries = await FS.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = Path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        await visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".ts") || lower.endsWith(".js")) {
        results.push(absolutePath);
      }
    }
  }

  await visit(path, 0);
  return results;
}

async function walkPackageDirectories(root: string): Promise<string[]> {
  const packageDirs: string[] = [];

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > 4) {
      return;
    }
    let entries;
    try {
      entries = await FS.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
      packageDirs.push(dir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      await visit(Path.join(dir, entry.name), depth + 1);
    }
  }

  await visit(root, 0);
  return packageDirs;
}

function labelFromPath(path: string): string {
  return Path.basename(path);
}

function relativeDescription(root: string, path: string): string | undefined {
  const relative = Path.relative(root, path);
  if (!relative || relative === ".") {
    return undefined;
  }
  return relative;
}

function toResourceEntry(input: {
  path: string;
  scope: ServerPiResourceScope;
  kind: ServerPiResourceKind;
  label?: string;
  description?: string;
}): ServerPiResourceEntry {
  return {
    path: normalizeRoot(input.path),
    scope: input.scope,
    kind: input.kind,
    label: input.label?.trim() || labelFromPath(input.path),
    ...(input.description ? { description: input.description } : {}),
  };
}

async function collectFixedResources(roots: PiWorkspaceRoots): Promise<ServerPiResourceEntry[]> {
  return [
    toResourceEntry({
      path: Path.join(roots.globalRoot, "settings.json"),
      scope: "global",
      kind: "settings",
      label: "Global settings.json",
    }),
    toResourceEntry({
      path: Path.join(roots.projectRoot, "settings.json"),
      scope: "project",
      kind: "settings",
      label: "Project settings.json",
    }),
    toResourceEntry({
      path: Path.join(roots.globalRoot, "keybindings.json"),
      scope: "global",
      kind: "keybindings",
      label: "Global keybindings.json",
    }),
    toResourceEntry({
      path: Path.join(roots.globalRoot, "AGENTS.md"),
      scope: "global",
      kind: "instruction",
      label: "Global AGENTS.md",
    }),
    toResourceEntry({
      path: Path.join(roots.cwd, "AGENTS.md"),
      scope: "project",
      kind: "instruction",
      label: "Project AGENTS.md",
    }),
    toResourceEntry({
      path: Path.join(roots.cwd, "CLAUDE.md"),
      scope: "project",
      kind: "instruction",
      label: "Project CLAUDE.md",
    }),
    toResourceEntry({
      path: Path.join(roots.globalRoot, "SYSTEM.md"),
      scope: "global",
      kind: "system-prompt",
      label: "Global SYSTEM.md",
    }),
    toResourceEntry({
      path: Path.join(roots.projectRoot, "SYSTEM.md"),
      scope: "project",
      kind: "system-prompt",
      label: "Project SYSTEM.md",
    }),
    toResourceEntry({
      path: Path.join(roots.globalRoot, "APPEND_SYSTEM.md"),
      scope: "global",
      kind: "append-system-prompt",
      label: "Global APPEND_SYSTEM.md",
    }),
    toResourceEntry({
      path: Path.join(roots.projectRoot, "APPEND_SYSTEM.md"),
      scope: "project",
      kind: "append-system-prompt",
      label: "Project APPEND_SYSTEM.md",
    }),
  ];
}

async function collectScopedResources(input: {
  dir: string;
  root: string;
  scope: ServerPiResourceScope;
  kind: ServerPiResourceKind;
  walker: (dir: string) => Promise<string[]>;
  labelPrefix?: string;
}): Promise<ServerPiResourceEntry[]> {
  const files = await input.walker(input.dir);
  return files.map((path) => {
    const description = relativeDescription(input.root, path);
    return toResourceEntry({
      path,
      scope: input.scope,
      kind: input.kind,
      ...(input.labelPrefix ? { label: `${input.labelPrefix} ${labelFromPath(path)}` } : {}),
      ...(description ? { description } : {}),
    });
  });
}

function parseSettingsPackageSources(settings: PiSettingsFile | null): Set<string> {
  const sources = new Set<string>();
  if (!settings || !Array.isArray(settings.packages)) {
    return sources;
  }
  for (const entry of settings.packages) {
    if (typeof entry === "string" && entry.trim()) {
      sources.add(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object") {
      const source = (entry as PiSettingsPackageFilter).source;
      if (typeof source === "string" && source.trim()) {
        sources.add(source.trim());
      }
    }
  }
  return sources;
}

async function collectInstalledPackages(input: {
  root: string;
  scope: ServerPiResourceScope;
  activeSources: Set<string>;
}): Promise<PiInstalledPackage[]> {
  const candidates = [Path.join(input.root, "git"), Path.join(input.root, "npm")];
  const packageDirs = (
    await Promise.all(candidates.map((dir) => walkPackageDirectories(dir)))
  ).flat();
  const packages: PiInstalledPackage[] = [];

  for (const packageDir of packageDirs) {
    const pkg = await readJsonFile<{ name?: unknown; repository?: { url?: unknown } | unknown }>(
      Path.join(packageDir, "package.json"),
    );
    const packageName = typeof pkg?.name === "string" ? pkg.name : null;
    const repository = pkg?.repository;
    const repositoryUrl =
      repository &&
      typeof repository === "object" &&
      "url" in repository &&
      typeof repository.url === "string"
        ? repository.url
        : null;

    if (
      input.activeSources.size > 0 &&
      ![
        packageName,
        repositoryUrl,
        repositoryUrl?.replace(/^git\+/, ""),
        repositoryUrl?.replace(/\.git$/, ""),
        repositoryUrl?.replace(/^git\+/, "").replace(/\.git$/, ""),
      ].some((value) => value && input.activeSources.has(value))
    ) {
      continue;
    }

    packages.push({
      root: packageDir,
      scope: input.scope,
      label: packageName ?? Path.basename(packageDir),
    });
  }

  return packages;
}

async function resolveConfiguredEntries(input: {
  values: unknown;
  baseDir: string;
  rootLabel: string;
  kind: ServerPiResourceKind;
  scope: ServerPiResourceScope;
  walker: (dir: string) => Promise<string[]>;
}): Promise<{
  resources: ServerPiResourceEntry[];
  allowedRoots: string[];
  allowedFiles: string[];
}> {
  const resources: ServerPiResourceEntry[] = [];
  const allowedRoots: string[] = [];
  const allowedFiles: string[] = [];
  if (!Array.isArray(input.values)) {
    return { resources, allowedRoots, allowedFiles };
  }

  for (const value of input.values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalizedValue = value.trim().replace(/^[-+!]/, "");
    if (!normalizedValue || hasGlobSyntax(normalizedValue)) {
      continue;
    }
    const absolutePath = normalizeRoot(
      Path.isAbsolute(expandHome(normalizedValue))
        ? expandHome(normalizedValue)
        : Path.join(input.baseDir, normalizedValue),
    );
    const stat = await pathStat(absolutePath);
    if (!stat) {
      continue;
    }

    if (stat.isDirectory()) {
      allowedRoots.push(absolutePath);
      resources.push(
        ...(await collectScopedResources({
          dir: absolutePath,
          root: absolutePath,
          scope: input.scope,
          kind: input.kind,
          walker: input.walker,
          labelPrefix: `${input.rootLabel}`,
        })),
      );
      continue;
    }

    allowedFiles.push(absolutePath);
    resources.push(
      toResourceEntry({
        path: absolutePath,
        scope: input.scope,
        kind: input.kind,
        label: `${input.rootLabel} ${labelFromPath(absolutePath)}`,
        description: absolutePath,
      }),
    );
  }

  return { resources, allowedRoots, allowedFiles };
}

async function collectPackageResources(input: {
  packageRoot: string;
  packageLabel: string;
  scope: ServerPiResourceScope;
}): Promise<ServerPiResourceEntry[]> {
  const packageJsonPath = Path.join(input.packageRoot, "package.json");
  const packageJson = await readJsonFile<{
    pi?: {
      extensions?: unknown;
      skills?: unknown;
      prompts?: unknown;
      themes?: unknown;
    };
  }>(packageJsonPath);

  const manifest = packageJson?.pi;
  const resources: ServerPiResourceEntry[] = [];

  const addFromDeclaredPaths = async (
    kind: ServerPiResourceKind,
    declared: unknown,
    fallbackDir: string,
    walker: (dir: string) => Promise<string[]>,
  ) => {
    if (Array.isArray(declared) && declared.length > 0) {
      for (const entry of declared) {
        if (typeof entry !== "string") {
          continue;
        }
        const trimmed = entry.trim();
        if (!trimmed || hasGlobSyntax(trimmed)) {
          continue;
        }
        const absolutePath = normalizeRoot(Path.join(input.packageRoot, trimmed));
        const stat = await pathStat(absolutePath);
        if (!stat) {
          continue;
        }
        if (stat.isDirectory()) {
          resources.push(
            ...(await collectScopedResources({
              dir: absolutePath,
              root: absolutePath,
              scope: input.scope,
              kind,
              walker,
              labelPrefix: `${input.packageLabel}`,
            })),
          );
          continue;
        }
        resources.push(
          toResourceEntry({
            path: absolutePath,
            scope: input.scope,
            kind,
            label: `${input.packageLabel} ${labelFromPath(absolutePath)}`,
            description: `package: ${input.packageLabel}`,
          }),
        );
      }
      return;
    }

    const fallbackPath = Path.join(input.packageRoot, fallbackDir);
    resources.push(
      ...(await collectScopedResources({
        dir: fallbackPath,
        root: fallbackPath,
        scope: input.scope,
        kind,
        walker,
        labelPrefix: `${input.packageLabel}`,
      })),
    );
  };

  await addFromDeclaredPaths("extension", manifest?.extensions, "extensions", walkExtensions);
  await addFromDeclaredPaths("skill", manifest?.skills, "skills", walkSkillFiles);
  await addFromDeclaredPaths("prompt-template", manifest?.prompts, "prompts", (dir) =>
    listDirectFiles(dir, new Set([".md"])),
  );
  await addFromDeclaredPaths("theme", manifest?.themes, "themes", (dir) =>
    listDirectFiles(dir, new Set([".json"])),
  );

  return resources;
}

async function resolvePiWorkspaceAccess(input: {
  cwd: string;
  piHomePath?: string | null;
}): Promise<PiWorkspaceAccess> {
  const roots = resolvePiWorkspaceRoots(input);
  const fixed = await collectFixedResources(roots);
  const globalSettingsPath = Path.join(roots.globalRoot, "settings.json");
  const projectSettingsPath = Path.join(roots.projectRoot, "settings.json");
  const [globalSettings, projectSettings] = await Promise.all([
    readJsonFile<PiSettingsFile>(globalSettingsPath),
    readJsonFile<PiSettingsFile>(projectSettingsPath),
  ]);

  const [
    globalPrompts,
    projectPrompts,
    globalThemes,
    projectThemes,
    globalExtensions,
    projectExtensions,
    globalSkills,
    projectSkills,
    legacyGlobalSkills,
    legacyProjectSkills,
    configuredGlobalExtensions,
    configuredProjectExtensions,
    configuredGlobalSkills,
    configuredProjectSkills,
    configuredGlobalPrompts,
    configuredProjectPrompts,
    configuredGlobalThemes,
    configuredProjectThemes,
  ] = await Promise.all([
    collectScopedResources({
      dir: Path.join(roots.globalRoot, "prompts"),
      root: Path.join(roots.globalRoot, "prompts"),
      scope: "global",
      kind: "prompt-template",
      walker: (dir) => listDirectFiles(dir, new Set([".md"])),
    }),
    collectScopedResources({
      dir: Path.join(roots.projectRoot, "prompts"),
      root: Path.join(roots.projectRoot, "prompts"),
      scope: "project",
      kind: "prompt-template",
      walker: (dir) => listDirectFiles(dir, new Set([".md"])),
    }),
    collectScopedResources({
      dir: Path.join(roots.globalRoot, "themes"),
      root: Path.join(roots.globalRoot, "themes"),
      scope: "global",
      kind: "theme",
      walker: (dir) => listDirectFiles(dir, new Set([".json"])),
    }),
    collectScopedResources({
      dir: Path.join(roots.projectRoot, "themes"),
      root: Path.join(roots.projectRoot, "themes"),
      scope: "project",
      kind: "theme",
      walker: (dir) => listDirectFiles(dir, new Set([".json"])),
    }),
    collectScopedResources({
      dir: Path.join(roots.globalRoot, "extensions"),
      root: Path.join(roots.globalRoot, "extensions"),
      scope: "global",
      kind: "extension",
      walker: walkExtensions,
    }),
    collectScopedResources({
      dir: Path.join(roots.projectRoot, "extensions"),
      root: Path.join(roots.projectRoot, "extensions"),
      scope: "project",
      kind: "extension",
      walker: walkExtensions,
    }),
    collectScopedResources({
      dir: Path.join(roots.globalRoot, "skills"),
      root: Path.join(roots.globalRoot, "skills"),
      scope: "global",
      kind: "skill",
      walker: walkSkillFiles,
    }),
    collectScopedResources({
      dir: Path.join(roots.projectRoot, "skills"),
      root: Path.join(roots.projectRoot, "skills"),
      scope: "project",
      kind: "skill",
      walker: walkSkillFiles,
    }),
    collectScopedResources({
      dir: roots.legacyGlobalSkillsRoot,
      root: roots.legacyGlobalSkillsRoot,
      scope: "global",
      kind: "skill",
      walker: walkSkillFiles,
    }),
    collectScopedResources({
      dir: roots.legacyProjectSkillsRoot,
      root: roots.legacyProjectSkillsRoot,
      scope: "project",
      kind: "skill",
      walker: walkSkillFiles,
    }),
    resolveConfiguredEntries({
      values: globalSettings?.extensions,
      baseDir: roots.globalRoot,
      rootLabel: "Global configured",
      kind: "extension",
      scope: "global",
      walker: walkExtensions,
    }),
    resolveConfiguredEntries({
      values: projectSettings?.extensions,
      baseDir: roots.projectRoot,
      rootLabel: "Project configured",
      kind: "extension",
      scope: "project",
      walker: walkExtensions,
    }),
    resolveConfiguredEntries({
      values: globalSettings?.skills,
      baseDir: roots.globalRoot,
      rootLabel: "Global configured",
      kind: "skill",
      scope: "global",
      walker: walkSkillFiles,
    }),
    resolveConfiguredEntries({
      values: projectSettings?.skills,
      baseDir: roots.projectRoot,
      rootLabel: "Project configured",
      kind: "skill",
      scope: "project",
      walker: walkSkillFiles,
    }),
    resolveConfiguredEntries({
      values: globalSettings?.prompts,
      baseDir: roots.globalRoot,
      rootLabel: "Global configured",
      kind: "prompt-template",
      scope: "global",
      walker: (dir) => listDirectFiles(dir, new Set([".md"])),
    }),
    resolveConfiguredEntries({
      values: projectSettings?.prompts,
      baseDir: roots.projectRoot,
      rootLabel: "Project configured",
      kind: "prompt-template",
      scope: "project",
      walker: (dir) => listDirectFiles(dir, new Set([".md"])),
    }),
    resolveConfiguredEntries({
      values: globalSettings?.themes,
      baseDir: roots.globalRoot,
      rootLabel: "Global configured",
      kind: "theme",
      scope: "global",
      walker: (dir) => listDirectFiles(dir, new Set([".json"])),
    }),
    resolveConfiguredEntries({
      values: projectSettings?.themes,
      baseDir: roots.projectRoot,
      rootLabel: "Project configured",
      kind: "theme",
      scope: "project",
      walker: (dir) => listDirectFiles(dir, new Set([".json"])),
    }),
  ]);

  const [globalPackages, projectPackages] = await Promise.all([
    collectInstalledPackages({
      root: roots.globalRoot,
      scope: "global",
      activeSources: parseSettingsPackageSources(globalSettings),
    }),
    collectInstalledPackages({
      root: roots.projectRoot,
      scope: "project",
      activeSources: parseSettingsPackageSources(projectSettings),
    }),
  ]);

  const packageResources = (
    await Promise.all(
      [...globalPackages, ...projectPackages].map((pkg) =>
        collectPackageResources({
          packageRoot: pkg.root,
          packageLabel: pkg.label,
          scope: pkg.scope,
        }),
      ),
    )
  ).flat();

  const deduped = new Map<string, ServerPiResourceEntry>();
  for (const entry of [
    ...fixed,
    ...globalPrompts,
    ...projectPrompts,
    ...globalThemes,
    ...projectThemes,
    ...globalExtensions,
    ...projectExtensions,
    ...globalSkills,
    ...projectSkills,
    ...legacyGlobalSkills,
    ...legacyProjectSkills,
    ...configuredGlobalExtensions.resources,
    ...configuredProjectExtensions.resources,
    ...configuredGlobalSkills.resources,
    ...configuredProjectSkills.resources,
    ...configuredGlobalPrompts.resources,
    ...configuredProjectPrompts.resources,
    ...configuredGlobalThemes.resources,
    ...configuredProjectThemes.resources,
    ...packageResources,
  ]) {
    deduped.set(entry.path, entry);
  }

  const resources = [...deduped.values()].toSorted(
    (left, right) =>
      left.scope.localeCompare(right.scope) ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label),
  );

  const allowedRoots = [
    roots.globalRoot,
    roots.projectRoot,
    roots.cwd,
    roots.legacyGlobalSkillsRoot,
    roots.legacyProjectSkillsRoot,
    ...globalPackages.map((pkg) => pkg.root),
    ...projectPackages.map((pkg) => pkg.root),
    ...configuredGlobalExtensions.allowedRoots,
    ...configuredProjectExtensions.allowedRoots,
    ...configuredGlobalSkills.allowedRoots,
    ...configuredProjectSkills.allowedRoots,
    ...configuredGlobalPrompts.allowedRoots,
    ...configuredProjectPrompts.allowedRoots,
    ...configuredGlobalThemes.allowedRoots,
    ...configuredProjectThemes.allowedRoots,
  ].map(normalizeAllowedPath);

  const allowedFiles = [
    ...configuredGlobalExtensions.allowedFiles,
    ...configuredProjectExtensions.allowedFiles,
    ...configuredGlobalSkills.allowedFiles,
    ...configuredProjectSkills.allowedFiles,
    ...configuredGlobalPrompts.allowedFiles,
    ...configuredProjectPrompts.allowedFiles,
    ...configuredGlobalThemes.allowedFiles,
    ...configuredProjectThemes.allowedFiles,
  ].map(normalizeAllowedPath);

  return {
    roots,
    resources,
    allowedRoots: [...new Set(allowedRoots)],
    allowedFiles: [...new Set(allowedFiles)],
  };
}

export async function getPiWorkspaceInventory(input: {
  cwd: string;
  piHomePath?: string | null;
}): Promise<ServerGetPiWorkspaceResult> {
  const access = await resolvePiWorkspaceAccess(input);
  return {
    globalRoot: access.roots.globalRoot,
    projectRoot: access.roots.projectRoot,
    resources: access.resources,
  };
}

async function isPiResourcePathAllowed(input: {
  path: string;
  cwd: string;
  piHomePath?: string | null;
}): Promise<boolean> {
  const access = await resolvePiWorkspaceAccess({
    cwd: input.cwd,
    ...(input.piHomePath !== undefined ? { piHomePath: input.piHomePath } : {}),
  });
  const target = normalizeAllowedPath(input.path);
  if (access.allowedFiles.includes(target)) {
    return true;
  }
  return access.allowedRoots.some(
    (root) => target === root || target.startsWith(`${root}${Path.sep}`),
  );
}

export async function readPiResourceFile(input: {
  path: string;
  cwd: string;
  piHomePath?: string | null;
}): Promise<string> {
  if (!(await isPiResourcePathAllowed(input))) {
    throw new Error("Pi resource path is outside the allowed workspace.");
  }
  try {
    return await FS.readFile(normalizeRoot(input.path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function writePiResourceFile(input: {
  path: string;
  contents: string;
  cwd: string;
  piHomePath?: string | null;
}): Promise<void> {
  if (!(await isPiResourcePathAllowed(input))) {
    throw new Error("Pi resource path is outside the allowed workspace.");
  }
  const target = normalizeRoot(input.path);
  await FS.mkdir(Path.dirname(target), { recursive: true });
  await FS.writeFile(target, input.contents, "utf8");
}
