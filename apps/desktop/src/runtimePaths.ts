import * as OS from "node:os";
import * as Path from "node:path";

export function resolveDesktopBaseDir(env: NodeJS.ProcessEnv): string {
  // Desktop app keeps its own state root. Do not inherit generic T3CODE_HOME,
  // which is often set by repo-local dev shells and points at unrelated state.
  return env.PI_T3CODE_HOME?.trim() || Path.join(OS.homedir(), ".pi-t3code");
}

export function sanitizeDesktopBackendEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  delete nextEnv.T3CODE_PORT;
  delete nextEnv.T3CODE_AUTH_TOKEN;
  delete nextEnv.T3CODE_MODE;
  delete nextEnv.T3CODE_NO_BROWSER;
  delete nextEnv.T3CODE_HOST;
  delete nextEnv.T3CODE_DESKTOP_WS_URL;
  delete nextEnv.T3CODE_HOME;
  delete nextEnv.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD;
  delete nextEnv.VITE_DEV_SERVER_URL;
  return nextEnv;
}

export function resolveDesktopBackendCwd(): string {
  // Desktop app is global workspace browser, not repo-bound dev shell.
  // Keep server cwd at home dir in both dev and packaged runs so startup
  // never auto-focuses the desktop source repo.
  return OS.homedir();
}
