import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarkedIcon, FolderTreeIcon, PlusIcon, SearchIcon, Settings2Icon } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type {
  ServerGetPiWorkspaceResult,
  ServerPiResourceEntry,
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

function normalizeSkillName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildNewSkillPath(input: {
  workspace: ServerGetPiWorkspaceResult;
  scope: ServerPiResourceScope;
  name: string;
}): string {
  const root = input.scope === "global" ? input.workspace.globalRoot : input.workspace.projectRoot;
  return `${root}/skills/${input.name}/SKILL.md`;
}

function buildSkillStarterContent(name: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: Describe when ${name} should be used.`,
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "- Describe trigger conditions.",
    "",
    "## Steps",
    "1. Do first thing.",
    "2. Do second thing.",
    "",
  ].join("\n");
}

function getSkillCount(
  resources: ReadonlyArray<ServerPiResourceEntry>,
  scope: ServerPiResourceScope,
) {
  return resources.filter((resource) => resource.scope === scope).length;
}

function getSkillSummary(resources: ReadonlyArray<ServerPiResourceEntry>) {
  return {
    total: resources.length,
    global: getSkillCount(resources, "global"),
    project: getSkillCount(resources, "project"),
  };
}

function findSettingsResource(
  workspace: ServerGetPiWorkspaceResult | undefined,
  scope: ServerPiResourceScope,
): ServerPiResourceEntry | null {
  return (
    workspace?.resources.find(
      (resource) => resource.kind === "settings" && resource.scope === scope,
    ) ?? null
  );
}

export const SkillsSettingsPanel = memo(function SkillsSettingsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftContents, setDraftContents] = useState("");
  const [createScope, setCreateScope] = useState<ServerPiResourceScope>("project");
  const [createName, setCreateName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: piWorkspaceQueryKey,
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getPiWorkspace();
    },
    staleTime: 15_000,
  });

  const skillResources = useMemo(
    () =>
      (workspaceQuery.data?.resources ?? EMPTY_PI_RESOURCES).filter(
        (resource) => resource.kind === "skill",
      ),
    [workspaceQuery.data?.resources],
  );

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return skillResources;
    }
    return skillResources.filter((resource) => {
      const description = resource.description?.toLowerCase() ?? "";
      return (
        resource.label.toLowerCase().includes(query) ||
        resource.path.toLowerCase().includes(query) ||
        resource.scope.toLowerCase().includes(query) ||
        description.includes(query)
      );
    });
  }, [search, skillResources]);

  useEffect(() => {
    if (!selectedPath && filteredSkills[0]) {
      setSelectedPath(filteredSkills[0].path);
      return;
    }
    if (selectedPath && filteredSkills.every((resource) => resource.path !== selectedPath)) {
      setSelectedPath(filteredSkills[0]?.path ?? null);
    }
  }, [filteredSkills, selectedPath]);

  const selectedSkill = useMemo(
    () => filteredSkills.find((resource) => resource.path === selectedPath) ?? null,
    [filteredSkills, selectedPath],
  );

  const resourceQuery = useQuery({
    queryKey: piResourceQueryKey(selectedPath),
    queryFn: async () => ensureNativeApi().server.readPiResource({ path: selectedPath! }),
    enabled: Boolean(selectedPath),
    staleTime: 0,
  });

  useEffect(() => {
    setDraftContents(resourceQuery.data?.contents ?? "");
  }, [resourceQuery.data?.contents, selectedPath]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { path: string; contents: string }) => {
      return ensureNativeApi().server.writePiResource(payload);
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: piWorkspaceQueryKey });
      await queryClient.invalidateQueries({ queryKey: piResourceQueryKey(variables.path) });
      toastManager.add({
        type: "success",
        title: "Skill saved",
        description: variables.path,
      });
    },
    onError: (error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not save skill",
        description: error instanceof Error ? error.message : "Save failed.",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: { path: string; contents: string }) => {
      await ensureNativeApi().server.writePiResource(input);
      return input;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: piWorkspaceQueryKey });
      await queryClient.invalidateQueries({ queryKey: piResourceQueryKey(result.path) });
      setSelectedPath(result.path);
      setCreateDialogOpen(false);
      setCreateName("");
      toastManager.add({
        type: "success",
        title: "Skill created",
        description: result.path,
      });
    },
    onError: (error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not create skill",
        description: error instanceof Error ? error.message : "Create failed.",
      });
    },
  });

  const summary = getSkillSummary(skillResources);
  const globalSettings = findSettingsResource(workspaceQuery.data, "global");
  const projectSettings = findSettingsResource(workspaceQuery.data, "project");
  const isDirty = draftContents !== (resourceQuery.data?.contents ?? "");

  const openSettingsResource = async (path: string) => {
    setSelectedPath(path);
    await queryClient.invalidateQueries({ queryKey: piResourceQueryKey(path) });
  };

  const handleCreate = async () => {
    const workspace = workspaceQuery.data;
    const normalizedName = normalizeSkillName(createName);
    if (!workspace) {
      toastManager.add({
        type: "error",
        title: "Pi workspace unavailable",
        description: "Refresh settings and try again.",
      });
      return;
    }
    if (!normalizedName) {
      toastManager.add({
        type: "error",
        title: "Invalid skill name",
        description: "Use letters, numbers, hyphens, or underscores.",
      });
      return;
    }
    const path = buildNewSkillPath({ workspace, scope: createScope, name: normalizedName });
    if (skillResources.some((resource) => resource.path === path)) {
      toastManager.add({
        type: "error",
        title: "Skill already exists",
        description: path,
      });
      return;
    }
    await createMutation.mutateAsync({
      path,
      contents: buildSkillStarterContent(normalizedName),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Skills</h2>
              <p className="text-sm text-muted-foreground">
                See installed skills. Search, inspect, edit, create new ones, and jump to Pi
                settings files that control skill loading.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={workspaceQuery.isLoading}
                onClick={() => void workspaceQuery.refetch()}
              >
                {workspaceQuery.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <PlusIcon className="size-4" />
                New skill
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Installed", value: summary.total, icon: BookMarkedIcon },
              { label: "Global", value: summary.global, icon: Settings2Icon },
              { label: "Project", value: summary.project, icon: FolderTreeIcon },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border bg-card px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <Icon className="size-3.5" />
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border bg-card p-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search installed skills"
                  aria-label="Search installed skills"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Skill loading
              </div>
              <div className="space-y-2">
                {projectSettings ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => void openSettingsResource(projectSettings.path)}
                  >
                    Project settings.json
                  </Button>
                ) : null}
                {globalSettings ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => void openSettingsResource(globalSettings.path)}
                  >
                    Global settings.json
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Use settings files to point Pi at extra skill folders and package sources.
                </p>
              </div>
            </div>

            <div className="max-h-[620px] overflow-y-auto rounded-2xl border bg-card">
              {workspaceQuery.isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading skills…</div>
              ) : filteredSkills.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No skills found.</div>
              ) : (
                filteredSkills.map((skill) => (
                  <button
                    key={skill.path}
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-1 border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-accent/50",
                      selectedPath === skill.path && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => setSelectedPath(skill.path)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{skill.label}</span>
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {skill.scope}
                      </span>
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {skill.description ?? skill.path}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card min-h-[620px]">
            {!selectedSkill ? (
              <Empty className="min-h-[620px] py-10">
                <EmptyMedia variant="icon">
                  <BookMarkedIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No skill selected</EmptyTitle>
                  <EmptyDescription>
                    Pick a skill to inspect and edit it, or create a new one.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex h-full min-h-[620px] flex-col">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {selectedSkill.label}
                        </h3>
                        <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {selectedSkill.scope}
                        </span>
                      </div>
                      <p className="break-all text-[11px] text-muted-foreground">
                        {selectedSkill.path}
                      </p>
                      {selectedSkill.description ? (
                        <p className="text-xs text-muted-foreground">{selectedSkill.description}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
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
                    className="min-h-full w-full resize-none rounded-xl border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none transition-colors focus:border-ring"
                  />
                  {resourceQuery.isFetching ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">Refreshing skill…</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogPopup className="max-w-md">
            <DialogHeader>
              <DialogTitle>New skill</DialogTitle>
              <DialogDescription>
                Create a new skill inside your global or project Pi workspace.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="skill-scope">Scope</Label>
                <div className="flex gap-2">
                  {(["project", "global"] as const).map((scope) => (
                    <Button
                      key={scope}
                      id={scope === "project" ? "skill-scope" : undefined}
                      type="button"
                      variant={createScope === scope ? "default" : "outline"}
                      onClick={() => setCreateScope(scope)}
                    >
                      {scope === "project" ? "Project" : "Global"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-name">Skill name</Label>
                <Input
                  id="skill-name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="review-follow-up"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreate();
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Letters, numbers, hyphens, and underscores only.
                </p>
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create skill"}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
    </div>
  );
});
