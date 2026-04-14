import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { StringEnum } from "@mariozechner/pi-ai";
import {
  type AgentToolResult,
  type ExtensionAPI,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

type ResultStatus = "ok" | "error" | "aborted";

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  output: string;
  stderr: string;
  exitCode: number;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
  status: ResultStatus;
  usage: UsageStats;
}

interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: SingleResult[];
}

interface JsonMessagePart {
  type: string;
  text?: string;
}

interface JsonAssistantMessage {
  role?: string;
  content?: JsonMessagePart[];
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
}

interface JsonEvent {
  type?: string;
  message?: JsonAssistantMessage;
}

const TaskItem = Type.Object({
  agent: Type.String({ description: "Agent name" }),
  task: Type.String({ description: "Task for this agent" }),
  cwd: Type.Optional(Type.String({ description: "Optional working directory override" })),
});

const ChainItem = Type.Object({
  agent: Type.String({ description: "Agent name" }),
  task: Type.String({ description: "Task template. Supports {previous} placeholder." }),
  cwd: Type.Optional(Type.String({ description: "Optional working directory override" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description:
    'Which agent directories to use. Default: "project" so repo-local agents work without extra args.',
  default: "project",
});

const SubagentParams = Type.Object({
  agent: Type.Optional(Type.String({ description: "Agent name for single-agent mode" })),
  task: Type.Optional(Type.String({ description: "Task for single-agent mode" })),
  tasks: Type.Optional(
    Type.Array(TaskItem, { description: "Parallel mode: array of {agent, task, cwd?}" }),
  ),
  chain: Type.Optional(
    Type.Array(ChainItem, {
      description: "Chain mode: sequential steps with {previous} interpolation",
    }),
  ),
  agentScope: Type.Optional(AgentScopeSchema),
  confirmProjectAgents: Type.Optional(
    Type.Boolean({
      description:
        "Prompt before running project-local agents. Default false in this trusted repo.",
      default: false,
    }),
  ),
  cwd: Type.Optional(
    Type.String({ description: "Working directory override for single-agent mode" }),
  ),
});

function emptyUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
  };
}

function statusForResult(result: Pick<SingleResult, "exitCode" | "stopReason">): ResultStatus {
  if (result.stopReason === "aborted") return "aborted";
  if (result.exitCode !== 0 || result.stopReason === "error") return "error";
  return "ok";
}

function finalAssistantText(message: JsonAssistantMessage | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function summarize(text: string, maxChars = 160): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 3)}...`;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = Array.from({ length: items.length }) as TOut[];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        results[current] = await worker(items[current], current);
      }
    }),
  );

  return results;
}

async function writePromptToTempFile(
  agentName: string,
  prompt: string,
): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(dir, `prompt-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, { encoding: "utf8", mode: 0o600 });
  });
  return { dir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runSingleAgent(input: {
  defaultCwd: string;
  agents: AgentConfig[];
  agentName: string;
  task: string;
  cwd?: string;
  step?: number;
  signal?: AbortSignal;
  onUpdate?: OnUpdateCallback;
  makeDetails: (results: SingleResult[]) => SubagentDetails;
}): Promise<SingleResult> {
  const agent = input.agents.find((entry) => entry.name === input.agentName);
  if (!agent) {
    const available = input.agents.map((entry) => `"${entry.name}"`).join(", ") || "none";
    return {
      agent: input.agentName,
      agentSource: "unknown",
      task: input.task,
      output: "",
      stderr: `Unknown agent: "${input.agentName}". Available agents: ${available}.`,
      exitCode: 1,
      step: input.step,
      status: "error",
      usage: emptyUsage(),
    };
  }

  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const result: SingleResult = {
    agent: agent.name,
    agentSource: agent.source,
    task: input.task,
    output: "",
    stderr: "",
    exitCode: 0,
    model: agent.model,
    step: input.step,
    status: "ok",
    usage: emptyUsage(),
  };

  let tempDir: string | null = null;

  const emitUpdate = () => {
    input.onUpdate?.({
      content: [{ type: "text", text: result.output || "(running...)" }],
      details: input.makeDetails([result]),
    });
  };

  try {
    if (agent.systemPrompt.trim()) {
      const promptFile = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tempDir = promptFile.dir;
      args.push("--append-system-prompt", promptFile.filePath);
    }

    args.push(`Task: ${input.task}`);

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: input.cwd ?? input.defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let aborted = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;

        let event: JsonEvent;
        try {
          event = JSON.parse(line) as JsonEvent;
        } catch {
          return;
        }

        if (event.type !== "message_end" || !event.message || event.message.role !== "assistant") {
          return;
        }

        result.output = finalAssistantText(event.message) || result.output;
        if (event.message.model && !result.model) result.model = event.message.model;
        if (event.message.stopReason) result.stopReason = event.message.stopReason;
        if (event.message.errorMessage) result.errorMessage = event.message.errorMessage;

        const usage = event.message.usage;
        if (usage) {
          result.usage.turns += 1;
          result.usage.input += usage.input ?? 0;
          result.usage.output += usage.output ?? 0;
          result.usage.cacheRead += usage.cacheRead ?? 0;
          result.usage.cacheWrite += usage.cacheWrite ?? 0;
          result.usage.contextTokens = usage.totalTokens ?? result.usage.contextTokens;
          result.usage.cost += usage.cost?.total ?? 0;
        }

        emitUpdate();
      };

      proc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (chunk) => {
        result.stderr += chunk.toString();
      });

      const abortHandler = () => {
        aborted = true;
        result.stopReason = "aborted";
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 1_000).unref();
      };
      input.signal?.addEventListener("abort", abortHandler, { once: true });

      proc.on("error", (error) => {
        result.stderr += `\n${error instanceof Error ? error.message : String(error)}`;
      });

      proc.on("close", (code) => {
        if (stdoutBuffer.trim()) processLine(stdoutBuffer);
        input.signal?.removeEventListener("abort", abortHandler);
        if (aborted && (code ?? 0) === 0) {
          resolve(1);
          return;
        }
        resolve(code ?? 1);
      });
    });

    result.exitCode = exitCode;
    result.status = statusForResult({ exitCode: result.exitCode, stopReason: result.stopReason });
    if (!result.output && result.errorMessage) {
      result.output = result.errorMessage;
    }
    return result;
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function availableAgentsText(agents: AgentConfig[]): string {
  return agents.map((agent) => `${agent.name} (${agent.source})`).join(", ") || "none";
}

function renderSummary(result: SingleResult): string {
  const icon = result.status === "ok" ? "✓" : result.status === "aborted" ? "⚠" : "✗";
  const detail = summarize(result.output || result.errorMessage || result.stderr || "(no output)");
  return `${icon} ${result.agent}: ${detail}`;
}

export default function subagentExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate work to isolated subagents.",
      "Modes: single (agent + task), parallel (tasks[]), chain (chain[] with {previous}).",
      'Default agent scope is "project" in this repo so .pi/agents works automatically.',
      "Project-agent confirmation defaults to false for this trusted repo-local setup.",
    ].join(" "),
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agentScope: AgentScope = params.agentScope ?? "project";
      const confirmProjectAgents = params.confirmProjectAgents ?? false;
      const discovery = discoverAgents(ctx.cwd, agentScope);
      const agents = discovery.agents;

      const hasSingle = Boolean(params.agent && params.task);
      const hasParallel = (params.tasks?.length ?? 0) > 0;
      const hasChain = (params.chain?.length ?? 0) > 0;
      const modeCount = Number(hasSingle) + Number(hasParallel) + Number(hasChain);

      const makeDetails =
        (mode: "single" | "parallel" | "chain") =>
        (results: SingleResult[]): SubagentDetails => ({
          mode,
          agentScope,
          projectAgentsDir: discovery.projectAgentsDir,
          results,
        });

      if (modeCount !== 1) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid parameters. Provide exactly one of {agent+task}, {tasks}, or {chain}. Available agents: ${availableAgentsText(agents)}`,
            },
          ],
          details: makeDetails("single")([]),
          isError: true,
        };
      }

      if (
        (agentScope === "project" || agentScope === "both") &&
        confirmProjectAgents &&
        ctx.hasUI
      ) {
        const requestedAgentNames = new Set<string>();
        if (params.agent) requestedAgentNames.add(params.agent);
        for (const task of params.tasks ?? []) requestedAgentNames.add(task.agent);
        for (const step of params.chain ?? []) requestedAgentNames.add(step.agent);

        const projectAgentsRequested = Array.from(requestedAgentNames)
          .map((name) => agents.find((agent) => agent.name === name))
          .filter((agent): agent is AgentConfig => agent?.source === "project");

        if (projectAgentsRequested.length > 0) {
          const ok = await ctx.ui.confirm(
            "Run project-local agents?",
            `Agents: ${projectAgentsRequested.map((agent) => agent.name).join(", ")}\nSource: ${discovery.projectAgentsDir ?? "(unknown)"}`,
          );
          if (!ok) {
            return {
              content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
              details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
            };
          }
        }
      }

      if (hasChain && params.chain) {
        const results: SingleResult[] = [];
        let previous = "";

        for (let index = 0; index < params.chain.length; index += 1) {
          const step = params.chain[index];
          const task = step.task.replace(/\{previous\}/g, previous);
          const result = await runSingleAgent({
            defaultCwd: ctx.cwd,
            agents,
            agentName: step.agent,
            task,
            cwd: step.cwd,
            step: index + 1,
            signal,
            onUpdate: onUpdate
              ? (partial) => {
                  const current = partial.details?.results[0];
                  if (!current) return;
                  onUpdate({
                    content: partial.content,
                    details: makeDetails("chain")([...results, current]),
                  });
                }
              : undefined,
            makeDetails: makeDetails("chain"),
          });
          results.push(result);

          if (result.status !== "ok") {
            return {
              content: [
                {
                  type: "text",
                  text: `Chain stopped at step ${index + 1} (${step.agent}): ${result.errorMessage || result.stderr || result.output || "(no output)"}`,
                },
              ],
              details: makeDetails("chain")(results),
              isError: true,
            };
          }

          previous = result.output;
        }

        return {
          content: [{ type: "text", text: results.at(-1)?.output || "(no output)" }],
          details: makeDetails("chain")(results),
        };
      }

      if (hasParallel && params.tasks) {
        if (params.tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [
              {
                type: "text",
                text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
              },
            ],
            details: makeDetails("parallel")([]),
            isError: true,
          };
        }

        const liveResults: SingleResult[] = params.tasks.map((task) => ({
          agent: task.agent,
          agentSource: "unknown",
          task: task.task,
          output: "",
          stderr: "",
          exitCode: -1,
          status: "ok",
          usage: emptyUsage(),
        }));

        const emitParallelUpdate = () => {
          onUpdate?.({
            content: [
              {
                type: "text",
                text: `Parallel progress: ${liveResults.filter((result) => result.exitCode !== -1).length}/${liveResults.length} finished`,
              },
            ],
            details: makeDetails("parallel")([...liveResults]),
          });
        };

        const results = await mapWithConcurrencyLimit(
          params.tasks,
          MAX_CONCURRENCY,
          async (task, index) => {
            const result = await runSingleAgent({
              defaultCwd: ctx.cwd,
              agents,
              agentName: task.agent,
              task: task.task,
              cwd: task.cwd,
              signal,
              onUpdate: onUpdate
                ? (partial) => {
                    const current = partial.details?.results[0];
                    if (!current) return;
                    liveResults[index] = current;
                    emitParallelUpdate();
                  }
                : undefined,
              makeDetails: makeDetails("parallel"),
            });
            liveResults[index] = result;
            emitParallelUpdate();
            return result;
          },
        );

        const successCount = results.filter((result) => result.status === "ok").length;
        return {
          content: [
            {
              type: "text",
              text: `Parallel: ${successCount}/${results.length} succeeded\n\n${results.map(renderSummary).join("\n")}`,
            },
          ],
          details: makeDetails("parallel")(results),
          isError: successCount !== results.length,
        };
      }

      if (hasSingle && params.agent && params.task) {
        const result = await runSingleAgent({
          defaultCwd: ctx.cwd,
          agents,
          agentName: params.agent,
          task: params.task,
          cwd: params.cwd,
          signal,
          onUpdate,
          makeDetails: makeDetails("single"),
        });

        return {
          content: [
            {
              type: "text",
              text: result.output || result.errorMessage || result.stderr || "(no output)",
            },
          ],
          details: makeDetails("single")([result]),
          isError: result.status !== "ok",
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Invalid parameters. Available agents: ${availableAgentsText(agents)}`,
          },
        ],
        details: makeDetails("single")([]),
        isError: true,
      };
    },

    renderCall(args, theme) {
      const scope = args.agentScope ?? "project";
      if (Array.isArray(args.chain) && args.chain.length > 0) {
        return new Text(
          `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `chain (${args.chain.length})`)}${theme.fg("muted", ` [${scope}]`)}`,
          0,
          0,
        );
      }
      if (Array.isArray(args.tasks) && args.tasks.length > 0) {
        return new Text(
          `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `parallel (${args.tasks.length})`)}${theme.fg("muted", ` [${scope}]`)}`,
          0,
          0,
        );
      }
      return new Text(
        `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", args.agent || "...")}${theme.fg("muted", ` [${scope}]`)}`,
        0,
        0,
      );
    },

    renderResult(result) {
      const details = result.details as SubagentDetails | undefined;
      if (!details || details.results.length === 0) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "(no output)", 0, 0);
      }

      const lines = details.results.map(renderSummary);
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
