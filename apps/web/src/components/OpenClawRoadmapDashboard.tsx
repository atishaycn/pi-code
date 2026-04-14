import * as Schema from "effect/Schema";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  PlayCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  TargetIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useLocalStorage } from "../hooks/useLocalStorage";
import { ensureNativeApi } from "../nativeApi";
import {
  OPENCLAW_BACKLOG_DOCUMENT_PATH,
  OPENCLAW_ROADMAP_DOCUMENT_PATH,
  openClawRoadmapExecutionLoop,
  openClawRoadmapFeatures,
} from "../openclawRoadmap/openclawRoadmapData";
import {
  filterRoadmapFeatures,
  formatRoadmapPercent,
  getRoadmapChecklistSummary,
} from "../roadmap/roadmapLogic";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";

const OPENCLAW_ROADMAP_CHECKLIST_STORAGE_KEY = "t3code:openclaw-roadmap-checklist:v1";
const OpenClawRoadmapChecklistStateSchema = Schema.Record(Schema.String, Schema.Boolean);

type OpenClawRoadmapChecklistState = Record<string, boolean>;

export function OpenClawRoadmapDashboard() {
  const [checklistState, setChecklistState] = useLocalStorage<
    OpenClawRoadmapChecklistState,
    OpenClawRoadmapChecklistState
  >(
    OPENCLAW_ROADMAP_CHECKLIST_STORAGE_KEY,
    {} as OpenClawRoadmapChecklistState,
    OpenClawRoadmapChecklistStateSchema,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeExecutionStep, setActiveExecutionStep] = useState(0);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isLaunchingImplementation, setIsLaunchingImplementation] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const filteredFeatures = useMemo(
    () => filterRoadmapFeatures(openClawRoadmapFeatures, searchQuery),
    [searchQuery],
  );

  const summary = useMemo(() => {
    const totalSubtasks = openClawRoadmapFeatures.reduce(
      (count, feature) => count + feature.subtasks.length,
      0,
    );
    const completedSubtasks = openClawRoadmapFeatures.reduce(
      (count, feature) =>
        count + getRoadmapChecklistSummary(feature, checklistState).completedCount,
      0,
    );
    const currentFocus = openClawRoadmapFeatures.find((feature) => feature.isCurrentFocus) ?? null;
    const currentSubtask = currentFocus?.subtasks.find((subtask) => subtask.isCurrentFocus) ?? null;

    return {
      featureCount: openClawRoadmapFeatures.length,
      totalSubtasks,
      completedSubtasks,
      completionRatio: totalSubtasks === 0 ? 0 : completedSubtasks / totalSubtasks,
      currentFocus,
      currentSubtask,
    };
  }, [checklistState]);

  const refreshCurrentStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      window.location.reload();
    } finally {
      setTimeout(() => {
        setIsRefreshingStatus(false);
      }, 0);
    }
  };

  const launchImplementationTerminal = async () => {
    const api = ensureNativeApi();
    const config = await api.server.getConfig();
    const currentStepLabel =
      summary.currentSubtask?.label ?? summary.currentFocus?.title ?? "OpenClaw roadmap step";
    const currentExecutionStep =
      openClawRoadmapExecutionLoop[activeExecutionStep] ??
      "Review roadmap and implement next slice.";
    const binaryPath = config.settings.providers.codex.binaryPath.trim() || "pi";
    const prompt = [
      "Implement current OpenClaw roadmap step in this repository.",
      `Workstream: ${summary.currentFocus?.title ?? "OpenClaw roadmap"}.`,
      `Subtask: ${currentStepLabel}.`,
      `Execution step ${activeExecutionStep + 1}: ${currentExecutionStep}.`,
      `Read ${OPENCLAW_ROADMAP_DOCUMENT_PATH} and ${OPENCLAW_BACKLOG_DOCUMENT_PATH} first, then implement end-to-end.`,
      "Run bun fmt, bun lint, bun typecheck, and relevant bun run test coverage before finishing.",
    ].join(" ");
    const command = [
      `${shellQuoteForInline(binaryPath)} --full-autonomy @${OPENCLAW_ROADMAP_DOCUMENT_PATH} @${OPENCLAW_BACKLOG_DOCUMENT_PATH} ${shellQuoteForInline(prompt)}`,
      "exec $SHELL -l",
    ].join("; ");

    setIsLaunchingImplementation(true);
    setLaunchError(null);
    try {
      await api.shell.openTerminalWindow({
        cwd: config.cwd,
        command,
        title: `Implement: ${currentStepLabel}`,
      });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Unable to open terminal window.");
    } finally {
      setIsLaunchingImplementation(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 sm:p-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            {summary.currentFocus ? (
              <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning">Current focus</Badge>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <WrenchIcon className="size-4 text-primary" />
                        <span>{summary.currentFocus.title}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Working step:{" "}
                      <span className="font-medium text-foreground">
                        {summary.currentSubtask?.label ?? "Pick the next subtask"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      aria-label="Refresh current status"
                      onClick={() => {
                        void refreshCurrentStatus();
                      }}
                      disabled={isRefreshingStatus}
                    >
                      <RefreshCwIcon
                        className={isRefreshingStatus ? "size-4 animate-spin" : "size-4"}
                      />
                      {isRefreshingStatus ? "Refreshing..." : "Refresh status"}
                    </Button>
                    <Button
                      className="gap-2"
                      aria-label="Implement current step"
                      onClick={() => {
                        void launchImplementationTerminal();
                      }}
                      disabled={isLaunchingImplementation}
                    >
                      <PlayCircleIcon className="size-4" />
                      {isLaunchingImplementation ? "Opening terminal..." : "Implement current step"}
                    </Button>
                  </div>
                </div>
                {launchError ? (
                  <div className="mt-3 text-sm text-destructive">{launchError}</div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">OpenClaw roadmap</Badge>
                  <Badge variant="secondary">Coding-agent focused</Badge>
                </div>
                <CardTitle className="text-xl sm:text-2xl">
                  OpenClaw roadmap control center
                </CardTitle>
                <CardDescription className="max-w-3xl leading-relaxed">
                  A focused roadmap view for the Pi improvements learned from OpenClaw: diagnostics,
                  onboarding, runtime resilience, embedder APIs, operational skills, and reference
                  surfaces.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              icon={<TargetIcon className="size-4 text-primary" />}
              label="Workstreams"
              value={String(summary.featureCount)}
            />
            <SummaryCard
              icon={<CheckCircle2Icon className="size-4 text-emerald-500" />}
              label="Completed subtasks"
              value={`${summary.completedSubtasks}/${summary.totalSubtasks}`}
              helper={formatRoadmapPercent(summary.completionRatio)}
            />
            <SummaryCard
              icon={<BookOpenIcon className="size-4 text-sky-500" />}
              label="Source docs"
              value="2"
              helper="roadmap + backlog"
            />
            <SummaryCard
              icon={<PlayCircleIcon className="size-4 text-amber-500" />}
              label="Active step"
              value={String(activeExecutionStep + 1)}
              helper={openClawRoadmapExecutionLoop[activeExecutionStep]}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canonical docs</CardTitle>
              <CardDescription>Keep the dashboard anchored to the written roadmap.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <DocLink path={OPENCLAW_ROADMAP_DOCUMENT_PATH} />
              <DocLink path={OPENCLAW_BACKLOG_DOCUMENT_PATH} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Execution loop</CardTitle>
                  <CardDescription>
                    Recommended cadence for working through the roadmap.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setActiveExecutionStep(
                      (current) => (current + 1) % openClawRoadmapExecutionLoop.length,
                    )
                  }
                >
                  Next step
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {openClawRoadmapExecutionLoop.map((step, index) => {
                  const isActive = index === activeExecutionStep;
                  return (
                    <li
                      key={step}
                      className={[
                        "flex gap-3 rounded-lg border px-3 py-2 transition-colors",
                        isActive
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-transparent",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="contents"
                        onClick={() => setActiveExecutionStep(index)}
                        aria-pressed={isActive}
                      >
                        <span
                          className={[
                            "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-primary/10 text-primary",
                          ].join(" ")}
                        >
                          {index + 1}
                        </span>
                        <span>
                          {step}
                          {isActive ? (
                            <span className="ml-2 inline-flex align-middle">
                              <Badge variant="info">Working now</Badge>
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search roadmap</CardTitle>
          <CardDescription>Filter workstreams by goals, plans, tests, or subtasks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
                placeholder="Search diagnostics, auth profiles, embedder APIs, skills..."
                aria-label="Search OpenClaw roadmap items"
              />
            </div>
            <Button variant="outline" onClick={() => setSearchQuery("")}>
              Reset
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredFeatures.length} of {summary.featureCount} roadmap workstreams.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filteredFeatures.map((feature) => {
          const progress = getRoadmapChecklistSummary(feature, checklistState);

          return (
            <Card
              key={feature.id}
              className={
                feature.isCurrentFocus ? "border-primary/40 shadow-sm shadow-primary/10" : undefined
              }
            >
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      feature.priority === "P0"
                        ? "destructive"
                        : feature.priority === "P1"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {feature.priority}
                  </Badge>
                  <Badge variant="outline">{feature.category}</Badge>
                  {feature.isCurrentFocus ? <Badge variant="info">Current focus</Badge> : null}
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription className="leading-relaxed">{feature.summary}</CardDescription>
                <div className="text-sm text-muted-foreground">
                  {progress.completedCount}/{progress.totalCount} subtasks complete (
                  {formatRoadmapPercent(progress.completionRatio)})
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <SectionList title="Evidence" items={feature.evidence} />
                <SectionList title="Implementation plan" items={feature.implementationPlan} />
                <SectionList title="Test plan" items={feature.testPlan} />
                <SectionList
                  title="Sub-agent architecture"
                  items={[
                    feature.subagentArchitecture.coordinator,
                    ...feature.subagentArchitecture.workers,
                    ...feature.subagentArchitecture.validation,
                  ]}
                />
                <div className="lg:col-span-2">
                  <div className="mb-2 text-sm font-medium text-foreground">Checklist</div>
                  <div className="space-y-2">
                    {feature.subtasks.map((subtask) => (
                      <label
                        key={subtask.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 px-3 py-2"
                      >
                        <Checkbox
                          checked={Boolean(checklistState[subtask.id])}
                          onCheckedChange={(checked) => {
                            setChecklistState((current) => {
                              if (checked) {
                                return { ...current, [subtask.id]: true };
                              }

                              if (!(subtask.id in current)) {
                                return current;
                              }

                              const next = { ...current };
                              delete next[subtask.id];
                              return next;
                            });
                          }}
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {subtask.label}
                            </span>
                            {subtask.isCurrentFocus ? (
                              <Badge variant="warning">Working now</Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{subtask.id}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard(props: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{props.value}</div>
      {props.helper ? (
        <div className="mt-1 text-xs text-muted-foreground">{props.helper}</div>
      ) : null}
    </div>
  );
}

function DocLink({ path }: { path: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs text-foreground">
      {path}
    </div>
  );
}

function shellQuoteForInline(value: string): string {
  return `'${value.replaceAll(`'`, `'\\''`)}'`;
}

function SectionList(props: { title: string; items: readonly string[] }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-foreground">{props.title}</div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {props.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
