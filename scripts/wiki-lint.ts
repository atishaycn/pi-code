#!/usr/bin/env node

import * as FS from "node:fs";
import * as Path from "node:path";

const repoRoot = process.cwd();
const wikiDir = Path.join(repoRoot, "wiki");
const requiredFiles = ["index.md", "log.md"];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

type LintError = {
  readonly file: string;
  readonly message: string;
};

function walkMarkdownFiles(dir: string): string[] {
  if (!FS.existsSync(dir)) return [];
  const entries = FS.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = Path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(nextPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(nextPath);
    }
  }

  return files.toSorted();
}

function stripAnchorAndQuery(target: string): string {
  const hashIndex = target.indexOf("#");
  const queryIndex = target.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  if (indexes.length === 0) return target;
  return target.slice(0, Math.min(...indexes));
}

function isExternalLink(target: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(target);
}

function lintWiki(): { readonly errors: LintError[]; readonly filesChecked: number } {
  const errors: LintError[] = [];

  if (!FS.existsSync(wikiDir)) {
    errors.push({ file: "wiki", message: "wiki directory missing" });
    return { errors, filesChecked: 0 };
  }

  for (const requiredFile of requiredFiles) {
    const requiredPath = Path.join(wikiDir, requiredFile);
    if (!FS.existsSync(requiredPath)) {
      errors.push({ file: `wiki/${requiredFile}`, message: "required file missing" });
    }
  }

  const files = walkMarkdownFiles(wikiDir);

  for (const file of files) {
    const content = FS.readFileSync(file, "utf8");
    const relativeFile = Path.relative(repoRoot, file);

    for (const match of content.matchAll(linkPattern)) {
      const rawTarget = match[1]?.trim();
      if (!rawTarget || isExternalLink(rawTarget) || rawTarget.startsWith("#")) {
        continue;
      }

      const normalizedTarget = stripAnchorAndQuery(rawTarget);
      if (!normalizedTarget) {
        continue;
      }

      const resolvedPath = Path.resolve(Path.dirname(file), normalizedTarget);
      if (!resolvedPath.startsWith(repoRoot)) {
        errors.push({
          file: relativeFile,
          message: `link escapes repo root: ${rawTarget}`,
        });
        continue;
      }

      if (!FS.existsSync(resolvedPath)) {
        errors.push({
          file: relativeFile,
          message: `broken link: ${rawTarget}`,
        });
      }
    }
  }

  return { errors, filesChecked: files.length };
}

const result = lintWiki();

if (result.errors.length > 0) {
  console.error(`wiki lint failed. files=${result.filesChecked} errors=${result.errors.length}`);
  for (const error of result.errors) {
    console.error(`- ${error.file}: ${error.message}`);
  }
  process.exit(1);
}

console.log(`wiki lint passed. files=${result.filesChecked}`);
