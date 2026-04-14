import * as Schema from "effect/Schema";
import {
  ActivityIcon,
  CheckCircle2Icon,
  FolderIcon,
  ListTodoIcon,
  RefreshCwIcon,
  SearchIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useStore } from "../store";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { ensureNativeApi } from "../nativeApi";
import { useWsConnectionStatus, type WsConnectionStatus } from "../rpc/wsConnectionState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { useRoadmapLiveState, type RoadmapLiveEvent } from "../roadmap/roadmapLiveState";
import {
  ROADMAP_DOCUMENT_PATH,
  ROADMAP_FEATURE_MAP_PATH,
  ROADMAP_RUNBOOK_PATH,
  roadmapExecutionLoop,
  roadmapFeatures,
  type RoadmapFeature,
  type RoadmapPriority,
  type RoadmapRepoStatus,
} from "../roadmap/roadmapData";
import {
  deriveRoadmapAutomationSummary,
  indexRoadmapAutomatedSubtasks,
  isRoadmapSubtaskAutomaticallyCompleted,
  isRoadmapSubtaskEffectivelyCompleted,
  type RoadmapAutomatedSubtaskState,
} from "../roadmap/roadmapAutomation";
import {
  deriveRoadmapDashboardSummary,
  filterRoadmapFeatures,
  formatRoadmapPercent,
  getRoadmapChecklistSummary,
} from "../roadmap/roadmapLogic";

const ROADMAP_CHECKLIST_STORAGE_KEY = "t3code:roadmap-checklist:v1";
const RoadmapChecklistStateSchema = Schema.Record(Schema.String, Schema.Boolean);

type RoadmapChecklistState = Record<string, boolean>;

interface RoadmapDashboardViewProps {
  readonly automationError: string | null;
  readonly automationLoading: boolean;
  readonly refreshDisabled: boolean;
  readonly automatedSubtasks: Readonly<Record<string, RoadmapAutomatedSubtaskState>>;
  readonly automationSummary: ReturnType<typeof deriveRoadmapAutomationSummary>;
  readonly checklistState: Readonly<RoadmapChecklistState>;
  readonly connectionStatus: WsConnectionStatus;
  readonly filteredFeatures: ReadonlyArray<RoadmapFeature>;
  readonly infrastructureChecks: ReadonlyArray<{
    id: string;
    label: string;
    completed: boolean;
    evidence: readonly string[];
  }>;
  readonly liveEvents: ReadonlyArray<RoadmapLiveEvent>;
  readonly searchQuery: string;
  readonly summary: ReturnType<typeof deriveRoadmapDashboardSummary>;
  readonly onRefreshStatus: () => void;
  readonly onSearchQueryChange: (value: string) => void;
  readonly onToggleSubtask: (subtaskId: string, checked: boolean) => void;
  readonly onResetSearch: () => void;
}

export function RoadmapDashboard() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const liveEvents = useRoadmapLiveState((state) => state.recentEvents);
  const connectionStatus = useWsConnectionStatus();
  const [checklistState, setChecklistState] = useLocalStorage<
    RoadmapChecklistState,
    RoadmapChecklistState
  >(ROADMAP_CHECKLIST_STORAGE_KEY, {} as RoadmapChecklistState, RoadmapChecklistStateSchema);
  const [searchQuery, setSearchQuery] = useState("");

  const roadmapStatusQuery = useQuery({
    queryKey: ["roadmap", "automation-status"],
    queryFn: async () => ensureNativeApi().server.getRoadmapStatus(),
    staleTime: 2_000,
    refetchInterval: 5_000,
  });

  const latestLiveEventSequence = liveEvents[0]?.sequence ?? null;
  const refetchRoadmapStatus = roadmapStatusQuery.refetch;

  useEffect(() => {
    if (latestLiveEventSequence === null) {
      return;
    }
    void refetchRoadmapStatus();
  }, [latestLiveEventSequence, refetchRoadmapStatus]);

  const automatedSubtasks = useMemo(
    () => indexRoadmapAutomatedSubtasks(roadmapStatusQuery.data),
    [roadmapStatusQuery.data],
  );
  const automationSummary = useMemo(
    () => deriveRoadmapAutomationSummary(roadmapStatusQuery.data),
    [roadmapStatusQuery.data],
  );
  const filteredFeatures = useMemo(
    () => filterRoadmapFeatures(roadmapFeatures, searchQuery),
    [searchQuery],
  );
  const summary = useMemo(
    () =>
      deriveRoadmapDashboardSummary({
        features: roadmapFeatures,
        checklistState,
        automatedSubtasks: Object.fromEntries(
          Object.entries(automatedSubtasks).map(([subtaskId, status]) => [
            subtaskId,
            status.completed,
          ]),
        ),
        threads,
        projectCount: projects.length,
        liveEvents,
      }),
    [automatedSubtasks, checklistState, liveEvents, projects.length, threads],
  );

  return (
    <RoadmapDashboardView
      automationError={
        roadmapStatusQuery.error instanceof Error ? roadmapStatusQuery.error.message : null
      }
      automationLoading={roadmapStatusQuery.isLoading}
      refreshDisabled={roadmapStatusQuery.isFetching}
      automatedSubtasks={automatedSubtasks}
      automationSummary={automationSummary}
      checklistState={checklistState}
      connectionStatus={connectionStatus}
      filteredFeatures={filteredFeatures}
      infrastructureChecks={roadmapStatusQuery.data?.infrastructure ?? []}
      liveEvents={liveEvents}
      searchQuery={searchQuery}
      summary={summary}
      onRefreshStatus={() => {
        void refetchRoadmapStatus();
      }}
      onSearchQueryChange={setSearchQuery}
      onResetSearch={() => setSearchQuery("")}
      onToggleSubtask={(subtaskId, checked) => {
        if (isRoadmapSubtaskAutomaticallyCompleted(subtaskId, automatedSubtasks)) {
          return;
        }

        setChecklistState((current) => {
          if (checked) {
            return {
              ...current,
              [subtaskId]: true,
            };
          }

          if (!(subtaskId in current)) {
            return current;
          }

          const nextState = { ...current };
          delete nextState[subtaskId];
          return nextState;
        });
      }}
    />
  );
}

export function RoadmapDashboardView(props: RoadmapDashboardViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 sm:p-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            {(() => {
              const currentFeature = props.filteredFeatures.find(
                (feature) => feature.isCurrentFocus,
              );
              const currentSubtask = currentFeature?.subtasks.find(
                (subtask) => subtask.isCurrentFocus,
              );
              if (!currentFeature || !currentSubtask) return null;

              return (
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">Currently in progress</Badge>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <WrenchIcon className="size-4 text-primary" />
                      <span>{currentFeature.title}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Active action item:{" "}
                    <span className="font-medium text-foreground">{currentSubtask.label}</span>
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">Realtime roadmap</Badge>
                  <Badge variant={connectionBadgeVariant(props.connectionStatus)}>
                    {connectionLabel(props.connectionStatus)}
                  </Badge>
                </div>
                <CardTitle className="text-xl sm:text-2xl">Parity control center</CardTitle>
                <CardDescription className="max-w-3xl leading-relaxed">
                  A live UI for tracking the missing upstream features called out in the feature
                  map, reviewing the implementation/testing plan for each item, and checking off
                  delivery subtasks as the work lands. Completed tasks now auto-update from repo
                  state when the server can verify them.
                </CardDescription>
              </div>
              <div className="flex min-w-[220px] flex-col items-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 self-end"
                  onClick={props.onRefreshStatus}
                  disabled={props.refreshDisabled}
                  aria-label="Refresh current status"
                >
                  <RefreshCwIcon
                    className={props.refreshDisabled ? "size-4 animate-spin" : "size-4"}
                  />
                  {props.refreshDisabled ? "Refreshing..." : "Refresh status"}
                </Button>
                <div className="grid w-full gap-2 text-xs text-muted-foreground sm:text-sm">
                  <div>
                    <div className="font-medium text-foreground">Source documents</div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground sm:text-xs">
                      {ROADMAP_FEATURE_MAP_PATH}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground sm:text-xs">
                      {ROADMAP_DOCUMENT_PATH}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground sm:text-xs">
                      {ROADMAP_RUNBOOK_PATH}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Checklist progress</div>
                    <div className="mt-1">
                      {props.summary.completedSubtaskCount}/{props.summary.totalSubtaskCount}{" "}
                      subtasks completed ({formatRoadmapPercent(props.summary.completionRatio)})
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                      Auto-tracked: {props.automationSummary.completedAutomatedSubtaskCount}/
                      {props.automationSummary.automatedSubtaskCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search roadmap</CardTitle>
            <CardDescription>
              Filter by title, category, evidence, implementation plan, test plan, or sub-agent
              architecture.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                aria-label="Search roadmap items"
                className="pl-9"
                placeholder="Search missing features, tests, or sub-agents"
                type="search"
                value={props.searchQuery}
                onChange={(event) => props.onSearchQueryChange(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
              <span>
                Showing {props.filteredFeatures.length} of {props.summary.featureCount} roadmap
                items
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={props.searchQuery.trim().length === 0}
                onClick={props.onResetSearch}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Items tracked from the feature map"
          icon={ListTodoIcon}
          title="Missing feature families"
          value={String(props.summary.featureCount)}
        />
        <MetricCard
          description="Threads currently marked running in the live read model"
          icon={ActivityIcon}
          title="Active threads"
          value={String(props.summary.runningThreadCount)}
        />
        <MetricCard
          description="Plan-mode threads in the current orchestration snapshot"
          icon={WorkflowIcon}
          title="Plan threads"
          value={String(props.summary.plannedThreadCount)}
        />
        <MetricCard
          description="Projects / threads / archived threads"
          icon={FolderIcon}
          title="Workspace scope"
          value={`${props.summary.projectCount} / ${props.summary.threadCount} / ${props.summary.archivedThreadCount}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Implementation checklist</CardTitle>
            <CardDescription>
              Each feature card includes evidence, implementation steps, test strategy, and the
              recommended scout → planner → worker → reviewer execution pattern.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {props.filteredFeatures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No roadmap items match this search yet.
              </div>
            ) : (
              props.filteredFeatures.map((feature) => (
                <RoadmapFeatureCard
                  key={feature.id}
                  automatedSubtasks={props.automatedSubtasks}
                  checklistState={props.checklistState}
                  feature={feature}
                  onToggleSubtask={props.onToggleSubtask}
                />
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live orchestration feed</CardTitle>
              <CardDescription>
                The panel below updates from the same realtime orchestration event stream that
                powers the rest of the app UI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Recent events cached
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {props.summary.recentEventCount}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Latest sequence
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {props.summary.latestEventSequence ?? "—"}
                  </div>
                </div>
              </div>

              <div
                aria-live="polite"
                className="mt-4 max-h-[26rem] space-y-2 overflow-auto rounded-xl border border-border/70 bg-muted/10 p-2"
              >
                {props.liveEvents.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-muted-foreground">
                    Waiting for orchestration activity… start a thread or interact with an existing
                    session to populate the live feed.
                  </div>
                ) : (
                  props.liveEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {event.summary}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
                            <span className="font-mono">#{event.sequence}</span>
                            <span>{event.type}</span>
                            <span className="font-mono">
                              {event.aggregateKind}:{event.aggregateId}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-[11px] text-muted-foreground sm:text-xs">
                          {formatEventTime(event.occurredAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automatic progress tracking</CardTitle>
              <CardDescription>
                Repo files and validation artifacts are polled automatically so completed work can
                roll into the roadmap without manual checkbox cleanup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Auto-tracked subtasks
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {props.automationSummary.completedAutomatedSubtaskCount}/
                    {props.automationSummary.automatedSubtaskCount}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Infrastructure checks
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {props.automationSummary.completedInfrastructureCount}/
                    {props.automationSummary.infrastructureCount}
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  Last refresh:{" "}
                  {props.automationSummary.generatedAt
                    ? formatEventTime(props.automationSummary.generatedAt)
                    : "Waiting for first sync…"}
                </div>
                {props.automationLoading ? <div>Refreshing automation status…</div> : null}
                {props.automationError ? (
                  <div className="text-destructive">{props.automationError}</div>
                ) : null}
              </div>
              <div className="space-y-2">
                {props.infrastructureChecks.map((check) => (
                  <div
                    key={check.id}
                    className="rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-foreground">{check.label}</div>
                      <Badge variant={check.completed ? "success" : "secondary"}>
                        {check.completed ? "Detected" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">
                  Latest validation artifact
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {props.automationSummary.validationChecks.map((check) => (
                    <div
                      key={check.id}
                      className="rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground">{check.label}</span>
                        <Badge variant={validationBadgeVariant(check.status)}>
                          {validationStatusLabel(check.status)}
                        </Badge>
                      </div>
                      {check.detail ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">{check.detail}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scheduled execution loop</CardTitle>
              <CardDescription>
                The new runbook turns parity work into a repeatable scheduled process instead of a
                one-off catch-up push.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="font-mono text-[11px] text-muted-foreground sm:text-xs">
                {ROADMAP_RUNBOOK_PATH}
              </div>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                {roadmapExecutionLoop.map((step) => (
                  <li key={step}>• {step}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What this page solves first</CardTitle>
              <CardDescription>
                It gives you a realtime, interactive command-center before the larger parity program
                starts landing feature-by-feature.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>• Live visibility into projects, threads, and orchestration activity.</li>
                <li>• One place to review every missing upstream feature and its test strategy.</li>
                <li>• An interactive todo list with nested subtasks persisted in local storage.</li>
                <li>• A delivery-oriented sub-agent architecture for each major feature family.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function RoadmapFeatureCard(props: {
  readonly automatedSubtasks: Readonly<Record<string, RoadmapAutomatedSubtaskState>>;
  readonly checklistState: Readonly<RoadmapChecklistState>;
  readonly feature: RoadmapFeature;
  readonly onToggleSubtask: (subtaskId: string, checked: boolean) => void;
}) {
  const progress = getRoadmapChecklistSummary(
    props.feature,
    props.checklistState,
    Object.fromEntries(
      Object.entries(props.automatedSubtasks).map(([subtaskId, status]) => [
        subtaskId,
        status.completed,
      ]),
    ),
  );

  return (
    <div
      className={
        props.feature.isCurrentFocus
          ? "rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-sm sm:p-5"
          : "rounded-2xl border border-border/70 bg-muted/10 p-4 sm:p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={priorityBadgeVariant(props.feature.priority)}>
              {props.feature.priority}
            </Badge>
            <Badge variant={repoStatusBadgeVariant(props.feature.repoStatus)}>
              {repoStatusLabel(props.feature.repoStatus)}
            </Badge>
            {progress.completedCount === progress.totalCount ? (
              <Badge variant="success">Execution complete</Badge>
            ) : progress.completedCount > 0 ? (
              <Badge variant="info">In progress</Badge>
            ) : null}
            <Badge variant="outline">{props.feature.category}</Badge>
            {props.feature.isCurrentFocus ? <Badge variant="warning">Current focus</Badge> : null}
          </div>
          <h3 className="text-base font-semibold text-foreground sm:text-lg">
            {props.feature.title}
          </h3>
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {props.feature.summary}
          </p>
        </div>

        <div className="min-w-[180px] rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <CheckCircle2Icon className="size-3.5" />
            Checklist
          </div>
          <div className="mt-2 font-medium text-foreground">
            {progress.completedCount}/{progress.totalCount} complete
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progress.completionRatio * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RoadmapListSection items={props.feature.evidence} title="Evidence" />
        <RoadmapListSection items={props.feature.implementationPlan} title="Implementation plan" />
        <RoadmapListSection items={props.feature.testPlan} title="Test plan" />
        <div className="rounded-xl border border-border/70 bg-background/60 p-4">
          <div className="text-sm font-medium text-foreground">Sub-agent architecture</div>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">Coordinator</div>
              <p className="mt-1 leading-relaxed">
                {props.feature.subagentArchitecture.coordinator}
              </p>
            </div>
            <RoadmapBulletList items={props.feature.subagentArchitecture.workers} />
            <div>
              <div className="font-medium text-foreground">Validation</div>
              <RoadmapBulletList items={props.feature.subagentArchitecture.validation} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-background/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <ListTodoIcon className="size-4" />
          Todo list and sub-items
        </div>
        <div className="grid gap-2">
          {props.feature.subtasks.map((subtask) => {
            const autoStatus = props.automatedSubtasks[subtask.id] ?? null;
            const checked = isRoadmapSubtaskEffectivelyCompleted({
              subtaskId: subtask.id,
              checklistState: props.checklistState,
              automatedSubtasks: props.automatedSubtasks,
            });
            const autoCompleted = autoStatus?.completed === true;
            return (
              <label
                key={subtask.id}
                className={
                  subtask.isCurrentFocus
                    ? "flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2"
                    : "flex items-start gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2"
                }
              >
                <Checkbox
                  checked={checked}
                  disabled={autoCompleted}
                  onCheckedChange={(nextChecked) =>
                    props.onToggleSubtask(subtask.id, nextChecked === true)
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className={
                        checked
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm text-foreground"
                      }
                    >
                      {subtask.label}
                    </div>
                    {autoStatus?.trackingMode === "automatic" ? (
                      <Badge variant={autoCompleted ? "success" : "outline"}>
                        {autoCompleted ? "Auto-complete" : "Auto-tracked"}
                      </Badge>
                    ) : null}
                    {props.checklistState[subtask.id] === true && !autoCompleted ? (
                      <Badge variant="info">Manual</Badge>
                    ) : null}
                    {subtask.isCurrentFocus ? <Badge variant="warning">In progress</Badge> : null}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                    {subtask.id}
                  </div>
                  {autoStatus && autoStatus.evidence.length > 0 ? (
                    <div className="mt-1 text-[11px] text-muted-foreground/80">
                      {autoCompleted ? "Detected from: " : "Tracking: "}
                      {autoStatus.evidence.join(", ")}
                    </div>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoadmapListSection({ items, title }: { items: ReadonlyArray<string>; title: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <RoadmapBulletList items={items} />
    </div>
  );
}

function RoadmapBulletList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MetricCard(props: {
  readonly description: string;
  readonly icon: typeof ActivityIcon;
  readonly title: string;
  readonly value: string;
}) {
  const Icon = props.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            <CardDescription className="mt-1">{props.description}</CardDescription>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-2 text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{props.value}</div>
      </CardContent>
    </Card>
  );
}

function priorityBadgeVariant(priority: RoadmapPriority) {
  switch (priority) {
    case "P0":
      return "warning" as const;
    case "P1":
      return "info" as const;
    case "P2":
      return "secondary" as const;
  }
}

function repoStatusBadgeVariant(status: RoadmapRepoStatus) {
  switch (status) {
    case "missing":
      return "error" as const;
    case "diverged":
      return "warning" as const;
    case "pi-only":
      return "info" as const;
  }
}

function repoStatusLabel(status: RoadmapRepoStatus) {
  switch (status) {
    case "missing":
      return "Missing in Pi";
    case "diverged":
      return "Diverged";
    case "pi-only":
      return "Pi only";
  }
}

function connectionBadgeVariant(status: WsConnectionStatus) {
  if (status.phase === "connected") return "success" as const;
  if (status.phase === "connecting") return "info" as const;
  if (status.online === false) return "warning" as const;
  return "error" as const;
}

function validationBadgeVariant(status: "unknown" | "pass" | "fail") {
  switch (status) {
    case "pass":
      return "success" as const;
    case "fail":
      return "error" as const;
    case "unknown":
      return "secondary" as const;
  }
}

function validationStatusLabel(status: "unknown" | "pass" | "fail") {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "unknown":
      return "Waiting";
  }
}

function connectionLabel(status: WsConnectionStatus) {
  if (status.phase === "connected") return "Connected";
  if (status.phase === "connecting") return "Connecting";
  if (status.online === false) return "Offline";
  if (status.reconnectPhase === "waiting") return "Reconnecting";
  return "Disconnected";
}

function formatEventTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
