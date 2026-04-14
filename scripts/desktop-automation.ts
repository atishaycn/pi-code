#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  _electron as playwrightElectron,
  type ElectronApplication,
  type Locator,
  type Page,
} from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const desktopDir = resolve(repoRoot, "apps/desktop");
const desktopRequire = createRequire(resolve(desktopDir, "package.json"));
const desktopMainPath = resolve(repoRoot, "apps/desktop/dist-electron/main.cjs");
const defaultPrompt =
  "Inspect this repo and summarize where Pi runtime integration and processing-state UI live. Use repo tools if needed.";
const defaultSteerPrompt =
  "Actually focus on ChatView processing states and queued follow-up behavior. Use repo tools if needed.";
const knownProcessingStates = [
  "Preparing worktree",
  "Connecting to Pi",
  "Starting turn",
  "Sending queued follow-up",
  "Pi running command",
  "Pi editing files",
  "Pi inspecting repo",
  "Pi searching web",
  "Pi inspecting image",
  "Pi reasoning",
  "Pi waiting for command approval",
  "Pi waiting for file-change approval",
  "Pi waiting for file-read approval",
  "Pi finalizing response",
  "Pi working",
] as const;

const scenarios = ["basic", "steer-queue"] as const;
type AutomationScenario = (typeof scenarios)[number];

interface DesktopAutomationOptions {
  readonly prompt: string;
  readonly steerPrompt: string;
  readonly artifactDir: string;
  readonly timeoutMs: number;
  readonly stallMs: number;
  readonly scenario: AutomationScenario;
}

interface StatusObservation {
  readonly state: string;
  readonly observedAt: string;
}

interface InteractionObservation {
  readonly action: string;
  readonly observedAt: string;
  readonly detail?: string;
}

interface RunSummary {
  readonly prompt: string;
  readonly steerPrompt: string;
  readonly scenario: AutomationScenario;
  readonly artifactDir: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly statuses: ReadonlyArray<StatusObservation>;
  readonly interactions: ReadonlyArray<InteractionObservation>;
  readonly completionDetected: boolean;
  readonly runStarted: boolean;
  readonly pageTitle: string;
}

function parseArgs(argv: ReadonlyArray<string>): DesktopAutomationOptions {
  let prompt = defaultPrompt;
  let steerPrompt = defaultSteerPrompt;
  let artifactDir = resolve(repoRoot, ".artifacts", "desktop-automation", timestampSlug());
  let timeoutMs = 180_000;
  let stallMs = 45_000;
  let scenario: AutomationScenario = "basic";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prompt") {
      prompt = argv[index + 1] ?? prompt;
      index += 1;
      continue;
    }
    if (arg === "--steer-prompt") {
      steerPrompt = argv[index + 1] ?? steerPrompt;
      index += 1;
      continue;
    }
    if (arg === "--artifact-dir") {
      artifactDir = resolve(argv[index + 1] ?? artifactDir);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = Number(argv[index + 1] ?? timeoutMs);
      index += 1;
      continue;
    }
    if (arg === "--stall-ms") {
      stallMs = Number(argv[index + 1] ?? stallMs);
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

  return { prompt, steerPrompt, artifactDir, timeoutMs, stallMs, scenario };
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stringEnv(baseEnv: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function resolveElectronExecutable(): string {
  const executablePath = desktopRequire("electron") as unknown;
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new Error("Failed to resolve Electron executable path.");
  }
  return executablePath;
}

async function captureScreenshot(page: Page, artifactDir: string, name: string): Promise<void> {
  await page.screenshot({ path: join(artifactDir, name), fullPage: true });
}

async function collectPageDetails(page: Page, artifactDir: string): Promise<void> {
  writeFileSync(join(artifactDir, "page.html"), await page.content());
  writeFileSync(join(artifactDir, "body.txt"), await page.locator("body").innerText());
}

async function launchDesktop(
  artifactDir: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const isolatedHome = join(artifactDir, "home");
  ensureDir(isolatedHome);

  const env = stringEnv(process.env);
  env.ELECTRON_ENABLE_LOGGING = "1";
  env.PI_T3CODE_HOME = isolatedHome;
  env.T3CODE_HOME = isolatedHome;
  env.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD = "1";
  env.T3CODE_NO_BROWSER = "1";
  delete env.VITE_DEV_SERVER_URL;
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await playwrightElectron.launch({
    executablePath: resolveElectronExecutable(),
    args: [desktopMainPath],
    cwd: desktopDir,
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function ensureDesktopBuildExists(): Promise<void> {
  if (!existsSync(desktopMainPath)) {
    throw new Error(
      `Desktop build missing at ${desktopMainPath}. Run \`bun run build:desktop\` first or use automation cycle script.`,
    );
  }
}

async function waitForComposer(page: Page): Promise<void> {
  const composer = page.locator('[data-testid="composer-editor"]');
  try {
    await composer.waitFor({ state: "visible", timeout: 60_000 });
    return;
  } catch {
    const newThreadButton = page.locator('[data-testid="new-thread-button"]').first();
    if ((await newThreadButton.count()) > 0) {
      await newThreadButton.click();
      await composer.waitFor({ state: "visible", timeout: 20_000 });
      return;
    }
    throw new Error("Composer editor did not appear.");
  }
}

async function clearAndTypePrompt(page: Page, prompt: string): Promise<void> {
  const composer = page.locator('[data-testid="composer-editor"]');
  await composer.click();
  await page.keyboard.press("Meta+A").catch(() => undefined);
  await page.keyboard.press("Control+A").catch(() => undefined);
  await page.keyboard.press("Backspace");
  await page.keyboard.type(prompt, { delay: 12 });
}

async function clickButton(locator: Locator, errorMessage: string): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new Error(errorMessage);
  });
  await locator.click();
}

async function clickSend(page: Page): Promise<void> {
  await clickButton(
    page.locator('[data-testid="composer-send-message"], button[aria-label="Send message"]'),
    "Unable to find send button.",
  );
}

async function clickQueueFollowUp(page: Page): Promise<void> {
  await clickButton(
    page.locator(
      '[data-testid="composer-queue-followup"], button:has-text("Queue follow-up"), button:has-text("Queue next"), button:has-text("Queue")',
    ),
    "Unable to find queue follow-up button.",
  );
}

async function clickSteerNow(page: Page): Promise<void> {
  await clickButton(
    page.locator(
      '[data-testid="composer-steer-now"], button:has-text("Steer now"), button:has-text("Steer")',
    ),
    "Unable to find steer-now button.",
  );
}

async function isStopVisible(page: Page): Promise<boolean> {
  const stopButton = page.locator(
    '[data-testid="composer-stop-generation"], button[aria-label="Stop generation"]',
  );
  return stopButton.isVisible().catch(() => false);
}

async function currentProcessingState(page: Page): Promise<string | null> {
  const processingTitle = await page
    .locator('[data-testid="processing-status-title"]')
    .textContent()
    .catch(() => null);
  const trimmedTitle = processingTitle?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  for (const state of knownProcessingStates) {
    if (bodyText.includes(state)) {
      return state;
    }
  }
  return null;
}

async function queuedFollowUpCount(page: Page): Promise<number> {
  const rawCount = await page
    .locator('[data-testid="queued-followups-panel"]')
    .getAttribute("data-queued-followups-count")
    .catch(() => null);
  return rawCount ? Number(rawCount) || 0 : 0;
}

async function waitForRunStart(page: Page, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isStopVisible(page)) {
      return;
    }
    if (await hasRunningComposerControls(page)) {
      return;
    }
    if ((await currentProcessingState(page)) !== null) {
      return;
    }
    await wait(250);
  }
  throw new Error("Turn never entered a running state.");
}

async function hasRunningComposerControls(page: Page): Promise<boolean> {
  const steerVisible = await page
    .locator(
      '[data-testid="composer-steer-now"], button:has-text("Steer now"), button:has-text("Steer")',
    )
    .isVisible()
    .catch(() => false);
  if (steerVisible) {
    return true;
  }

  const queueVisible = await page
    .locator(
      '[data-testid="composer-queue-followup"], button:has-text("Queue follow-up"), button:has-text("Queue next"), button:has-text("Queue")',
    )
    .isVisible()
    .catch(() => false);
  if (queueVisible) {
    return true;
  }

  const busyVisible = await page
    .locator(
      'button[aria-label="Sending"], button[aria-label="Preparing worktree"], button[aria-label="Connecting"]',
    )
    .isVisible()
    .catch(() => false);
  return busyVisible;
}

async function waitForQueuedFollowUpCount(
  page: Page,
  expectedCount: number,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if ((await queuedFollowUpCount(page)) === expectedCount) {
      return;
    }
    await wait(250);
  }
  throw new Error(`Queued follow-up count never reached ${expectedCount}.`);
}

async function runScenario(
  page: Page,
  options: DesktopAutomationOptions,
  artifactDir: string,
  interactions: InteractionObservation[],
): Promise<void> {
  await waitForComposer(page);
  await captureScreenshot(page, artifactDir, "00-ready.png");

  await clearAndTypePrompt(page, options.prompt);
  interactions.push({ action: "prompt-entered", observedAt: nowIso(), detail: options.prompt });
  await captureScreenshot(page, artifactDir, "01-prompt-entered.png");
  await clickSend(page);
  interactions.push({ action: "send-clicked", observedAt: nowIso() });

  await waitForRunStart(page, Math.min(options.timeoutMs, 30_000));

  if (options.scenario !== "steer-queue") {
    return;
  }

  await clearAndTypePrompt(page, `${options.prompt} Queue this for later.`);
  await clickQueueFollowUp(page);
  interactions.push({ action: "queue-followup-clicked", observedAt: nowIso() });
  await waitForQueuedFollowUpCount(page, 1, 10_000);
  await captureScreenshot(page, artifactDir, "02-queued-followup.png");

  await clearAndTypePrompt(page, options.steerPrompt);
  await clickSteerNow(page);
  interactions.push({
    action: "steer-now-clicked",
    observedAt: nowIso(),
    detail: options.steerPrompt,
  });
  await captureScreenshot(page, artifactDir, "03-steer-now.png");
}

async function waitForRunLifecycle(
  page: Page,
  artifactDir: string,
  timeoutMs: number,
  stallMs: number,
): Promise<{
  readonly statuses: ReadonlyArray<StatusObservation>;
  readonly runStarted: boolean;
  readonly completionDetected: boolean;
}> {
  const statuses: StatusObservation[] = [];
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastState: string | null = null;
  let runStarted = false;

  while (Date.now() - startedAt < timeoutMs) {
    const stopVisible = await isStopVisible(page);
    if (stopVisible) {
      runStarted = true;
      lastProgressAt = Date.now();
    }

    const state = await currentProcessingState(page);
    if (state && state !== lastState) {
      lastState = state;
      lastProgressAt = Date.now();
      statuses.push({ state, observedAt: nowIso() });
      await captureScreenshot(
        page,
        artifactDir,
        `${String(statuses.length).padStart(2, "0")}-${slugify(state)}.png`,
      );
    }

    const queueCount = await queuedFollowUpCount(page);
    if (queueCount > 0) {
      lastProgressAt = Date.now();
    }

    const sendButtonReady = await page
      .locator('[data-testid="composer-send-message"], button[aria-label="Send message"]')
      .isVisible()
      .catch(() => false);
    if (runStarted && !stopVisible && sendButtonReady) {
      return { statuses, runStarted, completionDetected: true };
    }

    if (runStarted && Date.now() - lastProgressAt > stallMs) {
      throw new Error(`Desktop automation stalled after ${stallMs}ms without visible progress.`);
    }

    await wait(1_000);
  }

  return { statuses, runStarted, completionDetected: false };
}

async function waitForSteerQueueEvidence(
  page: Page,
  timeoutMs: number,
): Promise<ReadonlyArray<StatusObservation>> {
  const startedAt = Date.now();
  const statuses: StatusObservation[] = [];
  let lastState: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const state = await currentProcessingState(page);
    if (state && state !== lastState) {
      lastState = state;
      statuses.push({ state, observedAt: nowIso() });
    }
    if ((await queuedFollowUpCount(page)) >= 1 && state !== null) {
      return statuses;
    }
    await wait(500);
  }

  throw new Error("Steer/queue evidence did not stabilize before timeout.");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.artifactDir);
  const startedAt = Date.now();
  const pageConsole: Array<{ type: string; text: string; at: string }> = [];
  const processOutput = { stdout: "", stderr: "" };
  const interactions: InteractionObservation[] = [];
  let app: ElectronApplication | null = null;
  let page: Page | null = null;

  await ensureDesktopBuildExists();

  try {
    ({ app, page } = await launchDesktop(options.artifactDir));

    app.process().stdout?.on("data", (chunk) => {
      processOutput.stdout += chunk.toString();
    });
    app.process().stderr?.on("data", (chunk) => {
      processOutput.stderr += chunk.toString();
    });

    page.on("console", (message) => {
      pageConsole.push({ type: message.type(), text: message.text(), at: nowIso() });
    });

    await runScenario(page, options, options.artifactDir, interactions);

    const lifecycle =
      options.scenario === "steer-queue"
        ? {
            statuses: await waitForSteerQueueEvidence(page, 30_000),
            runStarted: true,
            completionDetected: true,
          }
        : await waitForRunLifecycle(page, options.artifactDir, options.timeoutMs, options.stallMs);

    await collectPageDetails(page, options.artifactDir);
    await captureScreenshot(page, options.artifactDir, "99-final.png");

    const summary: RunSummary = {
      prompt: options.prompt,
      steerPrompt: options.steerPrompt,
      scenario: options.scenario,
      artifactDir: options.artifactDir,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: nowIso(),
      durationMs: Date.now() - startedAt,
      statuses: lifecycle.statuses,
      interactions,
      completionDetected: lifecycle.completionDetected,
      runStarted: lifecycle.runStarted,
      pageTitle: await page.title(),
    };

    writeJson(join(options.artifactDir, "summary.json"), summary);
    writeJson(join(options.artifactDir, "interactions.json"), interactions);
    writeJson(join(options.artifactDir, "page-console.json"), pageConsole);
    writeFileSync(join(options.artifactDir, "electron-stdout.log"), processOutput.stdout);
    writeFileSync(join(options.artifactDir, "electron-stderr.log"), processOutput.stderr);

    if (!lifecycle.runStarted) {
      throw new Error(
        "Prompt never entered a running state. No stop button or processing state appeared.",
      );
    }
    if (!lifecycle.completionDetected) {
      throw new Error("Prompt started, but completion was not detected before timeout.");
    }

    console.log(`Desktop automation passed. Artifacts: ${options.artifactDir}`);
  } catch (error) {
    if (page) {
      await captureScreenshot(page, options.artifactDir, "failure.png").catch(() => undefined);
      await collectPageDetails(page, options.artifactDir).catch(() => undefined);
    }
    writeJson(join(options.artifactDir, "page-console.json"), pageConsole);
    writeJson(join(options.artifactDir, "interactions.json"), interactions);
    writeFileSync(join(options.artifactDir, "electron-stdout.log"), processOutput.stdout);
    writeFileSync(join(options.artifactDir, "electron-stderr.log"), processOutput.stderr);
    writeJson(join(options.artifactDir, "error.json"), {
      message: error instanceof Error ? error.message : String(error),
      at: nowIso(),
    });
    console.error(`Desktop automation failed. Artifacts: ${options.artifactDir}`);
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
