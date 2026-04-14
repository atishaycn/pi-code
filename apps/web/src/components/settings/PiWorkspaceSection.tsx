import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2Icon,
  FilePlus2Icon,
  FolderTreeIcon,
  Paintbrush2Icon,
  ScrollTextIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type {
  ServerGetPiWorkspaceResult,
  ServerPiResourceEntry,
  ServerPiResourceKind,
  ServerPiResourceScope,
} from "@t3tools/contracts";

import { ensureNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toastManager } from "../ui/toast";

const piWorkspaceQueryKey = ["server", "piWorkspace"] as const;
const EMPTY_PI_RESOURCES: ServerPiResourceEntry[] = [];

function piResourceQueryKey(path: string | null) {
  return ["server", "piResource", path] as const;
}

function resourceGroupLabel(kind: ServerPiResourceKind): string {
  switch (kind) {
    case "settings":
      return "Settings";
    case "keybindings":
      return "Keybindings";
    case "instruction":
      return "Instructions";
    case "system-prompt":
      return "System prompt";
    case "append-system-prompt":
      return "Appended system prompt";
    case "prompt-template":
      return "Prompt templates";
    case "skill":
      return "Skills";
    case "extension":
      return "Extensions";
    case "theme":
      return "Themes";
  }
}

function starterContent(kind: ServerPiResourceKind, name: string): string {
  switch (kind) {
    case "prompt-template":
      return [
        "---",
        `description: ${name.replace(/-/g, " ")}`,
        "---",
        `Describe what /${name} should do.`,
        "",
      ].join("\n");
    case "skill":
      return [
        "---",
        `name: ${name}`,
        `description: Describe when the ${name} skill should be used.`,
        "---",
        "",
        `# ${name}`,
        "",
        "## Steps",
        "1. Do the first thing.",
        "2. Do the second thing.",
        "",
      ].join("\n");
    case "extension":
      return [
        'import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";',
        "",
        "export default function (pi: ExtensionAPI) {",
        `  pi.registerCommand("${name}", {`,
        `    description: "Run ${name}",`,
        "    handler: async (_args, ctx) => {",
        `      ctx.ui.notify("${name} ran", "info");`,
        "    },",
        "  });",
        "}",
        "",
      ].join("\n");
    case "theme":
      return JSON.stringify(
        {
          name,
          vars: {
            accent: "#7c3aed",
            muted: 244,
          },
          colors: {
            accent: "accent",
            border: "muted",
            borderAccent: "accent",
            borderMuted: "muted",
            success: "#22c55e",
            error: "#ef4444",
            warning: "#f59e0b",
            muted: "muted",
            dim: 240,
            text: "",
            thinkingText: "muted",
            selectedBg: "#262626",
            userMessageBg: "#262626",
            userMessageText: "",
            customMessageBg: "#262626",
            customMessageText: "",
            customMessageLabel: "accent",
            toolPendingBg: "#171717",
            toolSuccessBg: "#052e16",
            toolErrorBg: "#450a0a",
            toolTitle: "accent",
            toolOutput: "",
            mdHeading: "accent",
            mdLink: "accent",
            mdLinkUrl: "muted",
            mdCode: "accent",
            mdCodeBlock: "",
            mdCodeBlockBorder: "muted",
            mdQuote: "muted",
            mdQuoteBorder: "muted",
            mdHr: "muted",
            mdListBullet: "accent",
            toolDiffAdded: "#22c55e",
            toolDiffRemoved: "#ef4444",
            toolDiffContext: "muted",
            syntaxComment: "muted",
            syntaxKeyword: "accent",
            syntaxFunction: "accent",
            syntaxVariable: "#f59e0b",
            syntaxString: "#22c55e",
            syntaxNumber: "#ec4899",
            syntaxType: "accent",
            syntaxOperator: "accent",
            syntaxPunctuation: "muted",
            thinkingOff: "muted",
            thinkingMinimal: "accent",
            thinkingLow: "#60a5fa",
            thinkingMedium: "#22d3ee",
            thinkingHigh: "#c084fc",
            thinkingXhigh: "#ef4444",
            bashMode: "#f59e0b",
          },
        },
        null,
        2,
      );
    default:
      return "";
  }
}

function normalizeResourceName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildNewResourcePath(input: {
  workspace: ServerGetPiWorkspaceResult;
  kind: Extract<ServerPiResourceKind, "prompt-template" | "skill" | "extension" | "theme">;
  scope: ServerPiResourceScope;
  name: string;
}): string {
  const root = input.scope === "global" ? input.workspace.globalRoot : input.workspace.projectRoot;
  switch (input.kind) {
    case "prompt-template":
      return `${root}/prompts/${input.name}.md`;
    case "skill":
      return `${root}/skills/${input.name}/SKILL.md`;
    case "extension":
      return `${root}/extensions/${input.name}.ts`;
    case "theme":
      return `${root}/themes/${input.name}.json`;
  }
}

const CREATE_ACTIONS = [
  { kind: "prompt-template", scope: "project", label: "Prompt", icon: ScrollTextIcon },
  { kind: "skill", scope: "project", label: "Skill", icon: FolderTreeIcon },
  { kind: "extension", scope: "project", label: "Extension", icon: Code2Icon },
  { kind: "theme", scope: "project", label: "Theme", icon: Paintbrush2Icon },
] as const;

type CreateAction = (typeof CREATE_ACTIONS)[number];

export const PiWorkspaceSection = memo(function PiWorkspaceSection() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftContents, setDraftContents] = useState("");
  const [search, setSearch] = useState("");
  const [createDialogAction, setCreateDialogAction] = useState<CreateAction | null>(null);
  const [createName, setCreateName] = useState("");

  const workspaceQuery = useQuery({
    queryKey: piWorkspaceQueryKey,
    queryFn: async () => {
      const api = ensureNativeApi();
      if (typeof api.server.getPiWorkspace !== "function") {
        return {
          globalRoot: "",
          projectRoot: "",
          resources: [],
        } satisfies ServerGetPiWorkspaceResult;
      }
      return api.server.getPiWorkspace();
    },
    staleTime: 15_000,
  });

  const resources = workspaceQuery.data?.resources ?? EMPTY_PI_RESOURCES;
  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return resources;
    }
    return resources.filter(
      (resource) =>
        resource.label.toLowerCase().includes(query) ||
        resource.kind.toLowerCase().includes(query) ||
        resource.path.toLowerCase().includes(query) ||
        resource.scope.toLowerCase().includes(query),
    );
  }, [resources, search]);

  useEffect(() => {
    if (!selectedPath && filteredResources[0]) {
      setSelectedPath(filteredResources[0].path);
      return;
    }
    if (selectedPath && filteredResources.every((resource) => resource.path !== selectedPath)) {
      setSelectedPath(filteredResources[0]?.path ?? null);
    }
  }, [filteredResources, selectedPath]);

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.path === selectedPath) ?? null,
    [resources, selectedPath],
  );

  const resourceQuery = useQuery({
    queryKey: piResourceQueryKey(selectedPath),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (typeof api.server.readPiResource !== "function") {
        return { path: selectedPath!, contents: "" };
      }
      return api.server.readPiResource({ path: selectedPath! });
    },
    enabled: Boolean(selectedPath),
    staleTime: 0,
  });

  useEffect(() => {
    setDraftContents(resourceQuery.data?.contents ?? "");
  }, [resourceQuery.data?.contents, selectedPath]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { path: string; contents: string }) => {
      const api = ensureNativeApi();
      if (typeof api.server.writePiResource !== "function") {
        throw new Error("Pi resource saving is unavailable in this environment.");
      }
      return api.server.writePiResource(payload);
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: piWorkspaceQueryKey });
      await queryClient.invalidateQueries({ queryKey: piResourceQueryKey(variables.path) });
      toastManager.add({
        type: "success",
        title: "Pi resource saved",
        description: variables.path,
      });
    },
    onError: (error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not save Pi resource",
        description: error instanceof Error ? error.message : "Save failed.",
      });
    },
  });

  const createResource = useMutation({
    mutationFn: async (input: { path: string; contents: string; selectAfterSave: boolean }) => {
      const api = ensureNativeApi();
      if (typeof api.server.writePiResource !== "function") {
        throw new Error("Pi resource saving is unavailable in this environment.");
      }
      await api.server.writePiResource({ path: input.path, contents: input.contents });
      return input;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: piWorkspaceQueryKey });
      await queryClient.invalidateQueries({ queryKey: piResourceQueryKey(result.path) });
      if (result.selectAfterSave) {
        setSelectedPath(result.path);
      }
      toastManager.add({
        type: "success",
        title: "Pi resource created",
        description: result.path,
      });
    },
    onError: (error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not create Pi resource",
        description: error instanceof Error ? error.message : "Create failed.",
      });
    },
  });

  const isDirty = draftContents !== (resourceQuery.data?.contents ?? "");
  const groupedResources = useMemo(() => {
    const groups = new Map<string, ServerPiResourceEntry[]>();
    for (const resource of filteredResources) {
      const key = `${resource.scope}:${resource.kind}`;
      const existing = groups.get(key) ?? [];
      existing.push(resource);
      groups.set(key, existing);
    }
    return [...groups.entries()];
  }, [filteredResources]);

  const openCreateDialog = (action: CreateAction) => {
    setCreateName("");
    setCreateDialogAction(action);
  };

  const closeCreateDialog = () => {
    if (createResource.isPending) return;
    setCreateDialogAction(null);
    setCreateName("");
  };

  const handleCreate = async () => {
    const workspace = workspaceQuery.data;
    const action = createDialogAction;
    if (!workspace || !action) {
      toastManager.add({
        type: "error",
        title: "Pi workspace unavailable",
        description: "Refresh the workspace and try again.",
      });
      return;
    }
    const name = normalizeResourceName(createName);
    if (!name) {
      toastManager.add({
        type: "error",
        title: "Invalid resource name",
        description: "Use letters, numbers, hyphens, or underscores.",
      });
      return;
    }
    const path = buildNewResourcePath({ workspace, kind: action.kind, scope: action.scope, name });
    await createResource.mutateAsync({
      path,
      contents: starterContent(action.kind, name),
      selectAfterSave: true,
    });
    setCreateDialogAction(null);
    setCreateName("");
  };

  return (
    <div className="border-t border-border px-4 py-4 first:border-t-0 sm:px-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">Pi workspace</h3>
          <p className="text-xs text-muted-foreground">
            Edit Pi prompts, skills, extensions, themes, AGENTS files, and project-local Pi
            configuration without leaving the app.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CREATE_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={`${action.scope}:${action.kind}`}
                size="xs"
                variant="outline"
                disabled={workspaceQuery.isLoading || createResource.isPending}
                onClick={() => openCreateDialog(action)}
              >
                <Icon className="size-3.5" />
                New {action.label}
              </Button>
            );
          })}
          <Button
            size="xs"
            variant="ghost"
            disabled={workspaceQuery.isLoading}
            onClick={() => {
              void workspaceQuery.refetch().then((result) => {
                if (result.error) {
                  toastManager.add({
                    type: "error",
                    title: "Could not refresh Pi workspace",
                    description:
                      result.error instanceof Error ? result.error.message : "Refresh failed.",
                  });
                }
              });
            }}
          >
            {workspaceQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {workspaceQuery.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {workspaceQuery.error instanceof Error
              ? workspaceQuery.error.message
              : "Could not load Pi workspace resources."}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Pi files"
              aria-label="Search Pi resources"
            />
            <div className="max-h-112 overflow-y-auto rounded-xl border bg-background/70">
              {workspaceQuery.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground">Loading Pi resources…</div>
              ) : groupedResources.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No Pi resources found yet.</div>
              ) : (
                groupedResources.map(([key, entries]) => {
                  const [scope, kind] = key.split(":") as [
                    ServerPiResourceScope,
                    ServerPiResourceKind,
                  ];
                  return (
                    <div key={key} className="border-t border-border first:border-t-0">
                      <div className="px-3 py-2 font-medium text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {scope === "global" ? "Global" : "Project"} · {resourceGroupLabel(kind)}
                      </div>
                      <div className="space-y-1 px-1 pb-1">
                        {entries.map((resource) => (
                          <button
                            key={resource.path}
                            type="button"
                            className={cn(
                              "flex w-full flex-col rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60",
                              selectedPath === resource.path && "bg-accent text-accent-foreground",
                            )}
                            onClick={() => setSelectedPath(resource.path)}
                          >
                            <span className="truncate text-xs font-medium">{resource.label}</span>
                            <span className="truncate text-[11px] text-muted-foreground/80">
                              {resource.description ?? resource.path}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border bg-background/70">
            {!selectedResource ? (
              <Empty className="min-h-96 py-10">
                <EmptyMedia variant="icon">
                  <FilePlus2Icon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No Pi resource selected</EmptyTitle>
                  <EmptyDescription>
                    Pick a file from the list, or create a new prompt, skill, extension, or theme.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex h-full min-h-96 flex-col">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-medium text-foreground">
                          {selectedResource.label}
                        </h4>
                        <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {selectedResource.scope}
                        </span>
                      </div>
                      <p className="break-all text-[11px] text-muted-foreground">
                        {selectedResource.path}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      disabled={!selectedPath || !isDirty || saveMutation.isPending}
                      onClick={() => {
                        if (!selectedPath) return;
                        saveMutation.mutate({ path: selectedPath, contents: draftContents });
                      }}
                    >
                      {saveMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
                <div className="flex-1 p-3">
                  <textarea
                    value={draftContents}
                    onChange={(event) => setDraftContents(event.target.value)}
                    spellCheck={false}
                    className="min-h-[420px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none ring-0 transition-colors focus:border-ring"
                  />
                  {resourceQuery.isFetching ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">Refreshing file…</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
        <Dialog
          open={createDialogAction !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeCreateDialog();
            }
          }}
        >
          <DialogPopup className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {createDialogAction ? `New ${createDialogAction.label}` : "New Pi resource"}
              </DialogTitle>
              <DialogDescription>
                Create a new {createDialogAction?.scope ?? "project"} Pi{" "}
                {createDialogAction?.label.toLowerCase() ?? "resource"}. Files are created inside
                your Pi workspace and opened in the editor immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pi-resource-name">Name</Label>
                <Input
                  id="pi-resource-name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="my-resource"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreate();
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Letters, numbers, hyphens, and underscores are allowed.
                </p>
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeCreateDialog}
                disabled={createResource.isPending}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={createResource.isPending}>
                {createResource.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
    </div>
  );
});
