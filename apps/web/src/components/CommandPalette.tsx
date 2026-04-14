"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  FolderSearchIcon,
  ListTodoIcon,
  MessageSquareIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useCommandPaletteStore } from "../commandPaletteStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { isTerminalFocused } from "../lib/terminalFocus";
import { resolveShortcutCommand } from "../keybindings";
import { useSettings } from "../hooks/useSettings";
import { useStore } from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { cn } from "../lib/utils";
import { ProjectFavicon } from "./ProjectFavicon";
import { useServerKeybindings } from "../rpc/serverState";
import {
  resolveSidebarNewThreadEnvMode,
  resolveSidebarNewThreadSeedContext,
  sortThreadsForSidebar,
} from "./Sidebar.logic";
import {
  ADDON_ICON_CLASS,
  buildProjectActionItems,
  buildRootGroups,
  buildThreadActionItems,
  type CommandPaletteActionItem,
  type CommandPaletteSubmenuItem,
  type CommandPaletteView,
  filterCommandPaletteGroups,
  getCommandPaletteInputPlaceholder,
  getCommandPaletteMode,
  ITEM_ICON_CLASS,
  RECENT_THREAD_LIMIT,
} from "./CommandPalette.logic";
import { CommandPaletteResults } from "./CommandPaletteResults";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandInput,
  CommandPanel,
} from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";
import { toastManager } from "./ui/toast";

export function CommandPalette({ children }: { children: ReactNode }) {
  const open = useCommandPaletteStore((store) => store.open);
  const setOpen = useCommandPaletteStore((store) => store.setOpen);
  const toggleOpen = useCommandPaletteStore((store) => store.toggleOpen);
  const keybindings = useServerKeybindings();
  const { routeThreadId } = useHandleNewThread();
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });
      if (command !== "commandPalette.toggle") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggleOpen();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, terminalOpen, toggleOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {children}
      <CommandPaletteDialog />
    </CommandDialog>
  );
}

function CommandPaletteDialog() {
  const open = useCommandPaletteStore((store) => store.open);
  const setOpen = useCommandPaletteStore((store) => store.setOpen);

  useEffect(() => {
    return () => {
      setOpen(false);
    };
  }, [setOpen]);

  if (!open) {
    return null;
  }

  return <OpenCommandPaletteDialog />;
}

function OpenCommandPaletteDialog() {
  const navigate = useNavigate();
  const setOpen = useCommandPaletteStore((store) => store.setOpen);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const isActionsOnly = deferredQuery.startsWith(">");
  const settings = useSettings();
  const { activeDraftThread, activeThread, defaultProjectId, handleNewThread } =
    useHandleNewThread();
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const keybindings = useServerKeybindings();
  const [viewStack, setViewStack] = useState<CommandPaletteView[]>([]);
  const currentView = viewStack.at(-1) ?? null;
  const paletteMode = getCommandPaletteMode({ currentView });

  const projectTitleById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name] as const)),
    [projects],
  );

  const activeThreadId = activeThread?.id;
  const currentProjectId =
    activeThread?.projectId ?? activeDraftThread?.projectId ?? defaultProjectId;

  const openProjectFromSearch = useMemo(
    () => async (project: (typeof projects)[number]) => {
      const latestThread = sortThreadsForSidebar(
        threads.filter((thread) => thread.projectId === project.id && thread.archivedAt === null),
        settings.sidebarThreadSortOrder,
      )[0];
      if (latestThread) {
        await navigate({
          to: "/$threadId",
          params: { threadId: latestThread.id },
        });
        return;
      }

      await handleNewThread(project.id, {
        envMode: resolveSidebarNewThreadEnvMode({
          defaultEnvMode: settings.defaultThreadEnvMode,
        }),
      });
    },
    [
      handleNewThread,
      navigate,
      settings.defaultThreadEnvMode,
      settings.sidebarThreadSortOrder,
      threads,
    ],
  );

  const projectSearchItems = useMemo(
    () =>
      buildProjectActionItems({
        projects,
        valuePrefix: "project",
        icon: (project) => <ProjectFavicon cwd={project.cwd} className={ITEM_ICON_CLASS} />,
        runProject: openProjectFromSearch,
      }),
    [openProjectFromSearch, projects],
  );

  const projectThreadItems = useMemo(
    () =>
      buildProjectActionItems({
        projects,
        valuePrefix: "new-thread-in",
        icon: (project) => <ProjectFavicon cwd={project.cwd} className={ITEM_ICON_CLASS} />,
        runProject: async (project) => {
          const seedContext = resolveSidebarNewThreadSeedContext({
            projectId: project.id,
            defaultEnvMode: resolveSidebarNewThreadEnvMode({
              defaultEnvMode: settings.defaultThreadEnvMode,
            }),
            ...(activeThread !== undefined ? { activeThread } : {}),
            ...(activeDraftThread !== undefined ? { activeDraftThread } : {}),
          });
          await handleNewThread(project.id, seedContext);
        },
      }),
    [activeDraftThread, activeThread, handleNewThread, projects, settings.defaultThreadEnvMode],
  );

  const allThreadItems = useMemo(
    () =>
      buildThreadActionItems({
        threads,
        ...(activeThreadId ? { activeThreadId } : {}),
        projectTitleById,
        sortOrder: settings.sidebarThreadSortOrder,
        icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
        runThread: async (thread) => {
          await navigate({
            to: "/$threadId",
            params: { threadId: thread.id },
          });
        },
      }),
    [activeThreadId, navigate, projectTitleById, settings.sidebarThreadSortOrder, threads],
  );
  const recentThreadItems = allThreadItems.slice(0, RECENT_THREAD_LIMIT);

  function pushView(item: CommandPaletteSubmenuItem): void {
    setViewStack((previousViews) => [
      ...previousViews,
      {
        addonIcon: item.addonIcon,
        groups: item.groups,
        ...(item.initialQuery ? { initialQuery: item.initialQuery } : {}),
      },
    ]);
    setQuery(item.initialQuery ?? "");
  }

  function popView(): void {
    setViewStack((previousViews) => previousViews.slice(0, -1));
    setQuery("");
  }

  function handleQueryChange(nextQuery: string): void {
    setQuery(nextQuery);
    if (nextQuery === "" && currentView?.initialQuery) {
      popView();
    }
  }

  const actionItems: Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> = [];

  if (projects.length > 0) {
    const activeProjectTitle = currentProjectId
      ? (projectTitleById.get(currentProjectId) ?? null)
      : null;

    if (activeProjectTitle && currentProjectId) {
      actionItems.push({
        kind: "action",
        value: "action:new-thread",
        searchTerms: ["new thread", "chat", "create", "draft"],
        title: (
          <>
            New thread in <span className="font-semibold">{activeProjectTitle}</span>
          </>
        ),
        icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "chat.new",
        run: async () => {
          await handleNewThread(currentProjectId, {
            branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
            worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
            envMode:
              activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
          });
        },
      });
    }

    actionItems.push({
      kind: "submenu",
      value: "action:new-thread-in",
      searchTerms: ["new thread", "project", "pick", "choose", "select"],
      title: "New thread in...",
      icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
      addonIcon: <SquarePenIcon className={ADDON_ICON_CLASS} />,
      groups: [{ value: "projects", label: "Projects", items: projectThreadItems }],
    });

    actionItems.push({
      kind: "submenu",
      value: "action:open-project",
      searchTerms: ["open project", "project", "switch", "workspace"],
      title: "Open project...",
      icon: <FolderSearchIcon className={ITEM_ICON_CLASS} />,
      addonIcon: <FolderSearchIcon className={ADDON_ICON_CLASS} />,
      groups: [{ value: "projects", label: "Projects", items: projectSearchItems }],
    });
  }

  actionItems.push(
    {
      kind: "action",
      value: "action:roadmap",
      searchTerms: ["roadmap", "parity", "progress", "plan"],
      title: "Open roadmap",
      icon: <ListTodoIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await navigate({ to: "/roadmap" });
      },
    },
    {
      kind: "action",
      value: "action:archived-threads",
      searchTerms: ["archived", "threads", "history"],
      title: "Open archived threads",
      icon: <ArchiveIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await navigate({ to: "/settings/archived" });
      },
    },
    {
      kind: "action",
      value: "action:settings",
      searchTerms: ["settings", "preferences", "configuration", "keybindings"],
      title: "Open settings",
      icon: <SettingsIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await navigate({ to: "/settings/general" });
      },
    },
  );

  const rootGroups = buildRootGroups({ actionItems, recentThreadItems });
  const activeGroups = currentView ? currentView.groups : rootGroups;

  const displayedGroups = filterCommandPaletteGroups({
    activeGroups,
    query: deferredQuery,
    isInSubmenu: currentView !== null,
    projectSearchItems,
    threadSearchItems: allThreadItems,
  });

  const inputPlaceholder = getCommandPaletteInputPlaceholder(paletteMode);
  const isSubmenu = paletteMode === "submenu";

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Backspace" && query === "" && isSubmenu) {
      event.preventDefault();
      popView();
    }
  }

  function executeItem(item: CommandPaletteActionItem | CommandPaletteSubmenuItem): void {
    if (item.kind === "submenu") {
      pushView(item);
      return;
    }

    if (!item.keepOpen) {
      setOpen(false);
    }

    void item.run().catch((error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Unable to run command",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    });
  }

  return (
    <CommandDialogPopup
      aria-label="Command palette"
      className="overflow-hidden p-0"
      data-testid="command-palette"
    >
      <Command
        key={viewStack.length}
        aria-label="Command palette"
        autoHighlight="always"
        mode="none"
        onValueChange={handleQueryChange}
        value={query}
      >
        <CommandInput
          placeholder={inputPlaceholder}
          {...(isSubmenu
            ? {
                startAddon: (
                  <button
                    type="button"
                    className="flex cursor-pointer items-center"
                    aria-label="Back"
                    onClick={popView}
                  >
                    <ArrowLeftIcon />
                  </button>
                ),
              }
            : {})}
          onKeyDown={handleKeyDown}
        />
        <CommandPanel className="max-h-[min(28rem,70vh)]">
          <CommandPaletteResults
            groups={displayedGroups}
            isActionsOnly={isActionsOnly}
            keybindings={keybindings}
            onExecuteItem={executeItem}
          />
        </CommandPanel>
        <CommandFooter className="gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            <KbdGroup className="items-center gap-1.5">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span className={cn("text-muted-foreground/80")}>Navigate</span>
            </KbdGroup>
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Enter</Kbd>
              <span className={cn("text-muted-foreground/80")}>Select</span>
            </KbdGroup>
            {isSubmenu ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Backspace</Kbd>
                <span className={cn("text-muted-foreground/80")}>Back</span>
              </KbdGroup>
            ) : null}
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span className={cn("text-muted-foreground/80")}>Close</span>
            </KbdGroup>
            <KbdGroup className="items-center gap-1.5">
              <Kbd>&gt;</Kbd>
              <span className={cn("text-muted-foreground/80")}>Filter actions</span>
            </KbdGroup>
          </div>
        </CommandFooter>
      </Command>
    </CommandDialogPopup>
  );
}
