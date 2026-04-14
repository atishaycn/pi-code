import { type KeybindingCommand } from "@t3tools/contracts";
import type { SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";
import { type ReactNode } from "react";

import { sortThreadsForSidebar } from "./Sidebar.logic";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { type Project, type SidebarThreadSummary, type Thread } from "../types";

export const RECENT_THREAD_LIMIT = 12;
export const ITEM_ICON_CLASS = "size-4 text-muted-foreground/80";
export const ADDON_ICON_CLASS = "size-4";

export interface CommandPaletteItem {
  readonly kind: "action" | "submenu";
  readonly value: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly title: ReactNode;
  readonly description?: string;
  readonly timestamp?: string;
  readonly icon: ReactNode;
  readonly shortcutCommand?: KeybindingCommand;
}

export interface CommandPaletteActionItem extends CommandPaletteItem {
  readonly kind: "action";
  readonly keepOpen?: boolean;
  readonly run: () => Promise<void>;
}

export interface CommandPaletteSubmenuItem extends CommandPaletteItem {
  readonly kind: "submenu";
  readonly addonIcon: ReactNode;
  readonly groups: ReadonlyArray<CommandPaletteGroup>;
  readonly initialQuery?: string;
}

export interface CommandPaletteGroup {
  readonly value: string;
  readonly label: string;
  readonly items: ReadonlyArray<CommandPaletteActionItem | CommandPaletteSubmenuItem>;
}

export interface CommandPaletteView {
  readonly addonIcon: ReactNode;
  readonly groups: ReadonlyArray<CommandPaletteGroup>;
  readonly initialQuery?: string;
}

export type CommandPaletteMode = "root" | "submenu";

export function normalizeSearchText(value: string): string {
  return normalizeSearchQuery(value);
}

export function buildProjectActionItems(input: {
  projects: ReadonlyArray<Project>;
  valuePrefix: string;
  icon: (project: Project) => ReactNode;
  runProject: (project: Project) => Promise<void>;
}): CommandPaletteActionItem[] {
  return input.projects.map((project) => ({
    kind: "action",
    value: `${input.valuePrefix}:${project.id}`,
    searchTerms: [project.name, project.cwd],
    title: project.name,
    description: project.cwd,
    icon: input.icon(project),
    run: async () => {
      await input.runProject(project);
    },
  }));
}

export function buildThreadActionItems(input: {
  threads: ReadonlyArray<
    Pick<
      SidebarThreadSummary,
      "archivedAt" | "branch" | "createdAt" | "id" | "projectId" | "title"
    > & {
      updatedAt?: string | undefined;
      latestUserMessageAt?: string | null;
    }
  >;
  activeThreadId?: Thread["id"];
  projectTitleById: ReadonlyMap<Project["id"], string>;
  sortOrder: SidebarThreadSortOrder;
  icon: ReactNode;
  runThread: (thread: Pick<SidebarThreadSummary, "id">) => Promise<void>;
  limit?: number;
}): CommandPaletteActionItem[] {
  const sortedThreads = sortThreadsForSidebar(
    input.threads.filter((thread) => thread.archivedAt === null),
    input.sortOrder,
  );
  const visibleThreads =
    input.limit === undefined ? sortedThreads : sortedThreads.slice(0, input.limit);

  return visibleThreads.map((thread) => {
    const projectTitle = input.projectTitleById.get(thread.projectId);
    const descriptionParts: string[] = [];

    if (projectTitle) {
      descriptionParts.push(projectTitle);
    }
    if (thread.branch) {
      descriptionParts.push(`#${thread.branch}`);
    }
    if (thread.id === input.activeThreadId) {
      descriptionParts.push("Current thread");
    }

    return {
      kind: "action",
      value: `thread:${thread.id}`,
      searchTerms: [thread.title, projectTitle ?? "", thread.branch ?? ""],
      title: thread.title,
      description: descriptionParts.join(" · "),
      timestamp: formatRelativeTimeLabel(thread.updatedAt ?? thread.createdAt),
      icon: input.icon,
      run: async () => {
        await input.runThread(thread);
      },
    };
  });
}

function rankCommandPaletteItemMatch(
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem,
  normalizedQuery: string,
): number | null {
  const candidateScores = item.searchTerms.flatMap((term, index) => {
    const value = normalizeSearchText(term);
    if (!value) {
      return [];
    }

    const score = scoreQueryMatch({
      value,
      query: normalizedQuery,
      exactBase: index * 100,
      prefixBase: index * 100 + 4,
      boundaryBase: index * 100 + 8,
      includesBase: index * 100 + 12,
      fuzzyBase: index * 100 + 80,
    });

    return score === null ? [] : [score];
  });

  if (candidateScores.length === 0) {
    return null;
  }

  return Math.min(...candidateScores);
}

export function filterCommandPaletteGroups(input: {
  activeGroups: ReadonlyArray<CommandPaletteGroup>;
  query: string;
  isInSubmenu: boolean;
  projectSearchItems: ReadonlyArray<CommandPaletteActionItem>;
  threadSearchItems: ReadonlyArray<CommandPaletteActionItem>;
}): CommandPaletteGroup[] {
  const isActionsFilter = input.query.startsWith(">");
  const searchQuery = isActionsFilter ? input.query.slice(1) : input.query;
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (normalizedQuery.length === 0) {
    if (isActionsFilter) {
      return input.activeGroups.filter((group) => group.value === "actions");
    }
    return [...input.activeGroups];
  }

  let baseGroups = [...input.activeGroups];
  if (isActionsFilter) {
    baseGroups = baseGroups.filter((group) => group.value === "actions");
  } else if (!input.isInSubmenu) {
    baseGroups = baseGroups.filter((group) => group.value !== "recent-threads");
  }

  const searchableGroups = [...baseGroups];
  if (!input.isInSubmenu && !isActionsFilter) {
    if (input.projectSearchItems.length > 0) {
      searchableGroups.push({
        value: "projects-search",
        label: "Projects",
        items: input.projectSearchItems,
      });
    }
    if (input.threadSearchItems.length > 0) {
      searchableGroups.push({
        value: "threads-search",
        label: "Threads",
        items: input.threadSearchItems,
      });
    }
  }

  return searchableGroups.flatMap((group) => {
    const ranked: Array<{
      item: (typeof group.items)[number];
      score: number;
      tieBreaker: string;
    }> = [];

    for (const [index, item] of group.items.entries()) {
      const score = rankCommandPaletteItemMatch(item, normalizedQuery);
      if (score === null) {
        continue;
      }

      insertRankedSearchResult(
        ranked,
        {
          item,
          score,
          tieBreaker: `${index.toString().padStart(4, "0")}\u0000${item.value}`,
        },
        Number.POSITIVE_INFINITY,
      );
    }

    if (ranked.length === 0) {
      return [];
    }

    return [
      {
        value: group.value,
        label: group.label,
        items: ranked.map((entry) => entry.item),
      },
    ];
  });
}

export function getCommandPaletteMode(input: {
  currentView: CommandPaletteView | null;
}): CommandPaletteMode {
  return input.currentView ? "submenu" : "root";
}

export function buildRootGroups(input: {
  actionItems: ReadonlyArray<CommandPaletteActionItem | CommandPaletteSubmenuItem>;
  recentThreadItems: ReadonlyArray<CommandPaletteActionItem>;
}): CommandPaletteGroup[] {
  const groups: CommandPaletteGroup[] = [];
  if (input.actionItems.length > 0) {
    groups.push({ value: "actions", label: "Actions", items: input.actionItems });
  }
  if (input.recentThreadItems.length > 0) {
    groups.push({
      value: "recent-threads",
      label: "Recent Threads",
      items: input.recentThreadItems,
    });
  }
  return groups;
}

export function getCommandPaletteInputPlaceholder(mode: CommandPaletteMode): string {
  switch (mode) {
    case "root":
      return "Search commands, projects, and threads...";
    case "submenu":
      return "Search...";
  }
}
