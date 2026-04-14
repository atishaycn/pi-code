export const DEFAULT_DESKTOP_RESTART_ROOT = "/Users/suns/Developer/t3code-pi";

export function quotePosixShell(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildDevelopmentRestartCommand(
  rootDir: string = DEFAULT_DESKTOP_RESTART_ROOT,
): string {
  const normalizedRootDir = rootDir.trim();
  if (normalizedRootDir.length === 0) {
    throw new Error("Desktop restart root directory cannot be empty.");
  }

  return [`cd ${quotePosixShell(normalizedRootDir)}`, "bun run restart:desktop"].join("\n");
}
