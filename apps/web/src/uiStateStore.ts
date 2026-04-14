import { Debouncer } from "@tanstack/react-pacer";
import { type ProjectId, type ThreadId, type TurnId } from "@t3tools/contracts";
import { create } from "zustand";

const PERSISTED_STATE_KEY = "t3code:ui-state:v2";
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v8",
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

export interface ProjectTask {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
}

interface PersistedUiState {
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  pinnedThreadIds?: string[];
  threadCompletionOverrideById?: Record<string, ThreadCompletionOverride>;
  projectTasksByCwd?: Record<string, ProjectTask[]>;
  existingThreadsMarkedCompleted?: boolean;
}

export interface UiProjectState {
  projectExpandedById: Record<string, boolean>;
  projectOrder: ProjectId[];
  projectTasksById: Record<string, ProjectTask[]>;
}

export interface ThreadCompletionOverride {
  turnId: TurnId | null;
  completedAt: string | null;
}

export interface UiThreadState {
  pinnedThreadIds: ThreadId[];
  threadLastVisitedAtById: Record<string, string>;
  threadCompletionOverrideById: Record<string, ThreadCompletionOverride>;
  threadEnvModeById: Record<string, "local" | "worktree">;
}

export interface UiState extends UiProjectState, UiThreadState {}

export interface SyncProjectInput {
  id: ProjectId;
  cwd: string;
}

export interface SyncThreadInput {
  id: ThreadId;
  seedVisitedAt?: string | undefined;
  latestTurn?:
    | {
        turnId: TurnId;
        completedAt: string | null;
      }
    | null
    | undefined;
}

const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  projectTasksById: {},
  pinnedThreadIds: [],
  threadLastVisitedAtById: {},
  threadCompletionOverrideById: {},
  threadEnvModeById: {},
};

const persistedExpandedProjectCwds = new Set<string>();
const persistedProjectOrderCwds: string[] = [];
const persistedPinnedThreadIds: ThreadId[] = [];
const persistedThreadCompletionOverrideById: Record<string, ThreadCompletionOverride> = {};
const persistedProjectTasksByCwd: Record<string, ProjectTask[]> = {};
const currentProjectCwdById = new Map<ProjectId, string>();
let existingThreadsMarkedCompleted = false;
let legacyKeysCleanedUp = false;

function readPersistedState(): UiState {
  if (typeof window === "undefined") {
    return initialState;
  }
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) {
          continue;
        }
        hydratePersistedProjectState(JSON.parse(legacyRaw) as PersistedUiState);
        return {
          ...initialState,
          pinnedThreadIds: [...persistedPinnedThreadIds],
          threadCompletionOverrideById: { ...persistedThreadCompletionOverrideById },
        };
      }
      return initialState;
    }
    hydratePersistedProjectState(JSON.parse(raw) as PersistedUiState);
    return {
      ...initialState,
      pinnedThreadIds: [...persistedPinnedThreadIds],
      threadCompletionOverrideById: { ...persistedThreadCompletionOverrideById },
    };
  } catch {
    return initialState;
  }
}

function hydratePersistedProjectState(parsed: PersistedUiState): void {
  persistedExpandedProjectCwds.clear();
  persistedProjectOrderCwds.length = 0;
  persistedPinnedThreadIds.length = 0;
  for (const key of Object.keys(persistedThreadCompletionOverrideById)) {
    delete persistedThreadCompletionOverrideById[key];
  }
  for (const key of Object.keys(persistedProjectTasksByCwd)) {
    delete persistedProjectTasksByCwd[key];
  }
  existingThreadsMarkedCompleted = parsed.existingThreadsMarkedCompleted === true;
  for (const cwd of parsed.expandedProjectCwds ?? []) {
    if (typeof cwd === "string" && cwd.length > 0) {
      persistedExpandedProjectCwds.add(cwd);
    }
  }
  for (const cwd of parsed.projectOrderCwds ?? []) {
    if (typeof cwd === "string" && cwd.length > 0 && !persistedProjectOrderCwds.includes(cwd)) {
      persistedProjectOrderCwds.push(cwd);
    }
  }
  for (const threadId of parsed.pinnedThreadIds ?? []) {
    if (
      typeof threadId === "string" &&
      threadId.length > 0 &&
      !persistedPinnedThreadIds.includes(threadId as ThreadId)
    ) {
      persistedPinnedThreadIds.push(threadId as ThreadId);
    }
  }
  for (const [threadId, override] of Object.entries(parsed.threadCompletionOverrideById ?? {})) {
    if (
      typeof threadId === "string" &&
      threadId.length > 0 &&
      override &&
      typeof override === "object" &&
      (override.turnId === null || typeof override.turnId === "string") &&
      (override.completedAt === null || typeof override.completedAt === "string")
    ) {
      persistedThreadCompletionOverrideById[threadId] = {
        turnId: override.turnId,
        completedAt: override.completedAt,
      };
    }
  }
  for (const [cwd, tasks] of Object.entries(parsed.projectTasksByCwd ?? {})) {
    if (typeof cwd !== "string" || cwd.length === 0 || !Array.isArray(tasks)) {
      continue;
    }
    const nextTasks = tasks.flatMap((task) => {
      if (
        !task ||
        typeof task !== "object" ||
        typeof task.id !== "string" ||
        task.id.length === 0 ||
        typeof task.text !== "string" ||
        task.text.trim().length === 0 ||
        typeof task.completed !== "boolean" ||
        typeof task.createdAt !== "string" ||
        (task.completedAt !== null && typeof task.completedAt !== "string")
      ) {
        return [];
      }
      return [
        {
          id: task.id,
          text: task.text.trim(),
          completed: task.completed,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        } satisfies ProjectTask,
      ];
    });
    if (nextTasks.length > 0) {
      persistedProjectTasksByCwd[cwd] = nextTasks;
    }
  }
}

function persistState(state: UiState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const expandedProjectCwds = Object.entries(state.projectExpandedById)
      .filter(([, expanded]) => expanded)
      .flatMap(([projectId]) => {
        const cwd = currentProjectCwdById.get(projectId as ProjectId);
        return cwd ? [cwd] : [];
      });
    const projectOrderCwds = state.projectOrder.flatMap((projectId) => {
      const cwd = currentProjectCwdById.get(projectId);
      return cwd ? [cwd] : [];
    });
    const projectTasksByCwd = Object.fromEntries(
      Object.entries(state.projectTasksById).flatMap(([projectId, tasks]) => {
        const cwd = currentProjectCwdById.get(projectId as ProjectId);
        return cwd && tasks.length > 0 ? [[cwd, tasks]] : [];
      }),
    );
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        expandedProjectCwds,
        projectOrderCwds,
        pinnedThreadIds: state.pinnedThreadIds,
        threadCompletionOverrideById: state.threadCompletionOverrideById,
        projectTasksByCwd,
        existingThreadsMarkedCompleted,
      } satisfies PersistedUiState),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}

const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

function recordsEqual<T>(left: Record<string, T>, right: Record<string, T>): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (const [key, value] of leftEntries) {
    if (right[key] !== value) {
      return false;
    }
  }
  return true;
}

function projectOrdersEqual(left: readonly ProjectId[], right: readonly ProjectId[]): boolean {
  return (
    left.length === right.length && left.every((projectId, index) => projectId === right[index])
  );
}

export function syncProjects(state: UiState, projects: readonly SyncProjectInput[]): UiState {
  const previousProjectCwdById = new Map(currentProjectCwdById);
  const previousProjectIdByCwd = new Map(
    [...previousProjectCwdById.entries()].map(([projectId, cwd]) => [cwd, projectId] as const),
  );
  currentProjectCwdById.clear();
  for (const project of projects) {
    currentProjectCwdById.set(project.id, project.cwd);
  }
  const cwdMappingChanged =
    previousProjectCwdById.size !== currentProjectCwdById.size ||
    projects.some((project) => previousProjectCwdById.get(project.id) !== project.cwd);

  const nextExpandedById: Record<string, boolean> = {};
  const nextProjectTasksById: Record<string, ProjectTask[]> = {};
  const previousExpandedById = state.projectExpandedById;
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const mappedProjects = projects.map((project, index) => {
    const previousProjectIdForCwd = previousProjectIdByCwd.get(project.cwd);
    const expanded =
      previousExpandedById[project.id] ??
      (previousProjectIdForCwd ? previousExpandedById[previousProjectIdForCwd] : undefined) ??
      (persistedExpandedProjectCwds.size > 0
        ? persistedExpandedProjectCwds.has(project.cwd)
        : true);
    nextExpandedById[project.id] = expanded;
    nextProjectTasksById[project.id] =
      state.projectTasksById[project.id] ??
      (previousProjectIdForCwd ? state.projectTasksById[previousProjectIdForCwd] : undefined) ??
      persistedProjectTasksByCwd[project.cwd] ??
      [];
    return {
      id: project.id,
      cwd: project.cwd,
      incomingIndex: index,
    };
  });

  const nextProjectOrder =
    state.projectOrder.length > 0
      ? (() => {
          const nextProjectIdByCwd = new Map(
            mappedProjects.map((project) => [project.cwd, project.id] as const),
          );
          const usedProjectIds = new Set<ProjectId>();
          const orderedProjectIds: ProjectId[] = [];

          for (const projectId of state.projectOrder) {
            const matchedProjectId =
              (projectId in nextExpandedById ? projectId : undefined) ??
              (() => {
                const previousCwd = previousProjectCwdById.get(projectId);
                return previousCwd ? nextProjectIdByCwd.get(previousCwd) : undefined;
              })();
            if (!matchedProjectId || usedProjectIds.has(matchedProjectId)) {
              continue;
            }
            usedProjectIds.add(matchedProjectId);
            orderedProjectIds.push(matchedProjectId);
          }

          for (const project of mappedProjects) {
            if (usedProjectIds.has(project.id)) {
              continue;
            }
            orderedProjectIds.push(project.id);
          }

          return orderedProjectIds;
        })()
      : mappedProjects
          .map((project) => ({
            id: project.id,
            incomingIndex: project.incomingIndex,
            orderIndex:
              persistedOrderByCwd.get(project.cwd) ??
              persistedProjectOrderCwds.length + project.incomingIndex,
          }))
          .toSorted((left, right) => {
            const byOrder = left.orderIndex - right.orderIndex;
            if (byOrder !== 0) {
              return byOrder;
            }
            return left.incomingIndex - right.incomingIndex;
          })
          .map((project) => project.id);

  if (
    recordsEqual(state.projectExpandedById, nextExpandedById) &&
    projectOrdersEqual(state.projectOrder, nextProjectOrder) &&
    recordsEqual(state.projectTasksById, nextProjectTasksById) &&
    !cwdMappingChanged
  ) {
    return state;
  }

  return {
    ...state,
    projectExpandedById: nextExpandedById,
    projectOrder: nextProjectOrder,
    projectTasksById: nextProjectTasksById,
  };
}

export function addProjectTask(state: UiState, projectId: ProjectId, text: string): UiState {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return state;
  }
  const currentTasks = state.projectTasksById[projectId] ?? [];
  return {
    ...state,
    projectTasksById: {
      ...state.projectTasksById,
      [projectId]: [
        {
          id: crypto.randomUUID(),
          text: trimmed,
          completed: false,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
        ...currentTasks,
      ],
    },
  };
}

export function toggleProjectTask(state: UiState, projectId: ProjectId, taskId: string): UiState {
  const currentTasks = state.projectTasksById[projectId] ?? [];
  const nextTasks = currentTasks.map((task) =>
    task.id !== taskId
      ? task
      : {
          ...task,
          completed: !task.completed,
          completedAt: task.completed ? null : new Date().toISOString(),
        },
  );
  if (nextTasks.every((task, index) => task === currentTasks[index])) {
    return state;
  }
  return {
    ...state,
    projectTasksById: {
      ...state.projectTasksById,
      [projectId]: nextTasks,
    },
  };
}

export function removeProjectTask(state: UiState, projectId: ProjectId, taskId: string): UiState {
  const currentTasks = state.projectTasksById[projectId] ?? [];
  const nextTasks = currentTasks.filter((task) => task.id !== taskId);
  if (nextTasks.length === currentTasks.length) {
    return state;
  }
  return {
    ...state,
    projectTasksById: {
      ...state.projectTasksById,
      [projectId]: nextTasks,
    },
  };
}

export function syncThreads(state: UiState, threads: readonly SyncThreadInput[]): UiState {
  const retainedThreadIds = new Set(threads.map((thread) => thread.id));
  const nextPinnedThreadIds = state.pinnedThreadIds.filter((threadId) =>
    retainedThreadIds.has(threadId),
  );
  const nextThreadLastVisitedAtById = Object.fromEntries(
    Object.entries(state.threadLastVisitedAtById).filter(([threadId]) =>
      retainedThreadIds.has(threadId as ThreadId),
    ),
  );
  const nextThreadCompletionOverrideById = Object.fromEntries(
    Object.entries(state.threadCompletionOverrideById).filter(([threadId]) =>
      retainedThreadIds.has(threadId as ThreadId),
    ),
  );
  const nextThreadEnvModeById = Object.fromEntries(
    Object.entries(state.threadEnvModeById).filter(([threadId]) =>
      retainedThreadIds.has(threadId as ThreadId),
    ),
  );
  let appliedExistingThreadsCompletedMigration = existingThreadsMarkedCompleted;

  for (const thread of threads) {
    if (
      nextThreadLastVisitedAtById[thread.id] === undefined &&
      thread.seedVisitedAt !== undefined &&
      thread.seedVisitedAt.length > 0
    ) {
      nextThreadLastVisitedAtById[thread.id] = thread.seedVisitedAt;
    }

    const currentOverride = nextThreadCompletionOverrideById[thread.id];
    if (
      currentOverride &&
      !matchesThreadCompletionOverride({ latestTurn: thread.latestTurn, override: currentOverride })
    ) {
      delete nextThreadCompletionOverrideById[thread.id];
    }

    if (
      !appliedExistingThreadsCompletedMigration &&
      thread.latestTurn &&
      nextThreadCompletionOverrideById[thread.id] === undefined
    ) {
      nextThreadCompletionOverrideById[thread.id] = {
        turnId: thread.latestTurn.turnId,
        completedAt: thread.latestTurn.completedAt,
      };
    }
  }

  if (!appliedExistingThreadsCompletedMigration) {
    appliedExistingThreadsCompletedMigration = true;
  }

  if (
    state.pinnedThreadIds.length === nextPinnedThreadIds.length &&
    state.pinnedThreadIds.every((threadId, index) => threadId === nextPinnedThreadIds[index]) &&
    recordsEqual(state.threadLastVisitedAtById, nextThreadLastVisitedAtById) &&
    recordsEqual(state.threadCompletionOverrideById, nextThreadCompletionOverrideById) &&
    recordsEqual(state.threadEnvModeById, nextThreadEnvModeById) &&
    existingThreadsMarkedCompleted === appliedExistingThreadsCompletedMigration
  ) {
    return state;
  }

  existingThreadsMarkedCompleted = appliedExistingThreadsCompletedMigration;
  return {
    ...state,
    pinnedThreadIds: nextPinnedThreadIds,
    threadLastVisitedAtById: nextThreadLastVisitedAtById,
    threadCompletionOverrideById: nextThreadCompletionOverrideById,
    threadEnvModeById: nextThreadEnvModeById,
  };
}

export function setThreadEnvMode(
  state: UiState,
  threadId: ThreadId,
  envMode: "local" | "worktree",
): UiState {
  if (state.threadEnvModeById[threadId] === envMode) {
    return state;
  }
  return {
    ...state,
    threadEnvModeById: {
      ...state.threadEnvModeById,
      [threadId]: envMode,
    },
  };
}

export function markThreadVisited(state: UiState, threadId: ThreadId, visitedAt?: string): UiState {
  const at = visitedAt ?? new Date().toISOString();
  const visitedAtMs = Date.parse(at);
  const previousVisitedAt = state.threadLastVisitedAtById[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : NaN;
  if (
    Number.isFinite(previousVisitedAtMs) &&
    Number.isFinite(visitedAtMs) &&
    previousVisitedAtMs >= visitedAtMs
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: at,
    },
  };
}

export function markThreadUnread(
  state: UiState,
  threadId: ThreadId,
  latestTurnCompletedAt: string | null | undefined,
): UiState {
  if (!latestTurnCompletedAt) {
    return state;
  }
  const latestTurnCompletedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(latestTurnCompletedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
  if (state.threadLastVisitedAtById[threadId] === unreadVisitedAt) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: unreadVisitedAt,
    },
  };
}

export function matchesThreadCompletionOverride(input: {
  latestTurn:
    | {
        turnId: TurnId;
        completedAt: string | null;
      }
    | null
    | undefined;
  override: ThreadCompletionOverride | null | undefined;
}): boolean {
  if (!input.latestTurn || !input.override) {
    return false;
  }
  if (input.latestTurn.turnId !== input.override.turnId) {
    return false;
  }
  return (
    input.latestTurn.completedAt === input.override.completedAt ||
    input.override.completedAt === null
  );
}

export function markThreadCompleted(
  state: UiState,
  threadId: ThreadId,
  latestTurn:
    | {
        turnId: TurnId;
        completedAt: string | null;
      }
    | null
    | undefined,
): UiState {
  existingThreadsMarkedCompleted = true;
  if (!latestTurn) {
    return state;
  }
  const nextOverride: ThreadCompletionOverride = {
    turnId: latestTurn.turnId,
    completedAt: latestTurn.completedAt,
  };
  const previousOverride = state.threadCompletionOverrideById[threadId];
  if (
    previousOverride &&
    previousOverride.turnId === nextOverride.turnId &&
    previousOverride.completedAt === nextOverride.completedAt
  ) {
    return state;
  }
  return {
    ...state,
    threadCompletionOverrideById: {
      ...state.threadCompletionOverrideById,
      [threadId]: nextOverride,
    },
  };
}

export function clearThreadCompletionOverride(state: UiState, threadId: ThreadId): UiState {
  if (!(threadId in state.threadCompletionOverrideById)) {
    return state;
  }
  const nextThreadCompletionOverrideById = { ...state.threadCompletionOverrideById };
  delete nextThreadCompletionOverrideById[threadId];
  return {
    ...state,
    threadCompletionOverrideById: nextThreadCompletionOverrideById,
  };
}

export function clearThreadUi(state: UiState, threadId: ThreadId): UiState {
  if (
    !state.pinnedThreadIds.includes(threadId) &&
    !(threadId in state.threadLastVisitedAtById) &&
    !(threadId in state.threadCompletionOverrideById) &&
    !(threadId in state.threadEnvModeById)
  ) {
    return state;
  }
  const nextThreadLastVisitedAtById = { ...state.threadLastVisitedAtById };
  delete nextThreadLastVisitedAtById[threadId];
  const nextThreadCompletionOverrideById = { ...state.threadCompletionOverrideById };
  delete nextThreadCompletionOverrideById[threadId];
  const nextThreadEnvModeById = { ...state.threadEnvModeById };
  delete nextThreadEnvModeById[threadId];
  return {
    ...state,
    pinnedThreadIds: state.pinnedThreadIds.filter(
      (currentThreadId) => currentThreadId !== threadId,
    ),
    threadLastVisitedAtById: nextThreadLastVisitedAtById,
    threadCompletionOverrideById: nextThreadCompletionOverrideById,
    threadEnvModeById: nextThreadEnvModeById,
  };
}

export function togglePinnedThread(state: UiState, threadId: ThreadId): UiState {
  if (state.pinnedThreadIds.includes(threadId)) {
    return {
      ...state,
      pinnedThreadIds: state.pinnedThreadIds.filter(
        (currentThreadId) => currentThreadId !== threadId,
      ),
    };
  }

  return {
    ...state,
    pinnedThreadIds: [threadId, ...state.pinnedThreadIds],
  };
}

export function toggleProject(state: UiState, projectId: ProjectId): UiState {
  const expanded = state.projectExpandedById[projectId] ?? true;
  return {
    ...state,
    projectExpandedById: {
      ...state.projectExpandedById,
      [projectId]: !expanded,
    },
  };
}

export function setProjectExpanded(
  state: UiState,
  projectId: ProjectId,
  expanded: boolean,
): UiState {
  if ((state.projectExpandedById[projectId] ?? true) === expanded) {
    return state;
  }
  return {
    ...state,
    projectExpandedById: {
      ...state.projectExpandedById,
      [projectId]: expanded,
    },
  };
}

export function reorderProjects(
  state: UiState,
  draggedProjectId: ProjectId,
  targetProjectId: ProjectId,
): UiState {
  if (draggedProjectId === targetProjectId) {
    return state;
  }
  const draggedIndex = state.projectOrder.findIndex((projectId) => projectId === draggedProjectId);
  const targetIndex = state.projectOrder.findIndex((projectId) => projectId === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return state;
  }
  const projectOrder = [...state.projectOrder];
  const [draggedProject] = projectOrder.splice(draggedIndex, 1);
  if (!draggedProject) {
    return state;
  }
  projectOrder.splice(targetIndex, 0, draggedProject);
  return {
    ...state,
    projectOrder,
  };
}

interface UiStateStore extends UiState {
  syncProjects: (projects: readonly SyncProjectInput[]) => void;
  syncThreads: (threads: readonly SyncThreadInput[]) => void;
  markThreadVisited: (threadId: ThreadId, visitedAt?: string) => void;
  markThreadUnread: (threadId: ThreadId, latestTurnCompletedAt: string | null | undefined) => void;
  markThreadCompleted: (
    threadId: ThreadId,
    latestTurn:
      | {
          turnId: TurnId;
          completedAt: string | null;
        }
      | null
      | undefined,
  ) => void;
  clearThreadCompletionOverride: (threadId: ThreadId) => void;
  setThreadEnvMode: (threadId: ThreadId, envMode: "local" | "worktree") => void;
  clearThreadUi: (threadId: ThreadId) => void;
  togglePinnedThread: (threadId: ThreadId) => void;
  toggleProject: (projectId: ProjectId) => void;
  setProjectExpanded: (projectId: ProjectId, expanded: boolean) => void;
  reorderProjects: (draggedProjectId: ProjectId, targetProjectId: ProjectId) => void;
  addProjectTask: (projectId: ProjectId, text: string) => void;
  toggleProjectTask: (projectId: ProjectId, taskId: string) => void;
  removeProjectTask: (projectId: ProjectId, taskId: string) => void;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(),
  syncProjects: (projects) => set((state) => syncProjects(state, projects)),
  syncThreads: (threads) => set((state) => syncThreads(state, threads)),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId, latestTurnCompletedAt) =>
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt)),
  markThreadCompleted: (threadId, latestTurn) =>
    set((state) => markThreadCompleted(state, threadId, latestTurn)),
  clearThreadCompletionOverride: (threadId) =>
    set((state) => clearThreadCompletionOverride(state, threadId)),
  setThreadEnvMode: (threadId, envMode) =>
    set((state) => setThreadEnvMode(state, threadId, envMode)),
  clearThreadUi: (threadId) => set((state) => clearThreadUi(state, threadId)),
  togglePinnedThread: (threadId) => set((state) => togglePinnedThread(state, threadId)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  setProjectExpanded: (projectId, expanded) =>
    set((state) => setProjectExpanded(state, projectId, expanded)),
  reorderProjects: (draggedProjectId, targetProjectId) =>
    set((state) => reorderProjects(state, draggedProjectId, targetProjectId)),
  addProjectTask: (projectId, text) => set((state) => addProjectTask(state, projectId, text)),
  toggleProjectTask: (projectId, taskId) =>
    set((state) => toggleProjectTask(state, projectId, taskId)),
  removeProjectTask: (projectId, taskId) =>
    set((state) => removeProjectTask(state, projectId, taskId)),
}));

useUiStateStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

export function resetUiStatePersistenceForTests(): void {
  persistedExpandedProjectCwds.clear();
  persistedProjectOrderCwds.length = 0;
  persistedPinnedThreadIds.length = 0;
  for (const key of Object.keys(persistedThreadCompletionOverrideById)) {
    delete persistedThreadCompletionOverrideById[key];
  }
  for (const key of Object.keys(persistedProjectTasksByCwd)) {
    delete persistedProjectTasksByCwd[key];
  }
  existingThreadsMarkedCompleted = false;
  legacyKeysCleanedUp = false;
  currentProjectCwdById.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
}
