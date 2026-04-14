# Caveman prompt override

This repo enables Caveman-style response compression through:

- `.pi/APPEND_SYSTEM.md`
- repo-local subagents through `.pi/extensions/subagent/` and `.pi/agents/`

## What it does

Pi automatically appends that file to the coding-agent system prompt. With the resource-loader fix, this now applies when pi starts from the repo root or any nested subdirectory inside the repo.

## How to disable later

Permanent disable for this branch/repo:

```bash
rm .pi/APPEND_SYSTEM.md
```

Or keep it around but disable without deleting:

```bash
mv .pi/APPEND_SYSTEM.md .pi/APPEND_SYSTEM.md.disabled
```

Re-enable:

```bash
mv .pi/APPEND_SYSTEM.md.disabled .pi/APPEND_SYSTEM.md
```

## Subagents in this repo

Repo-local subagent setup now lives in:

- `.pi/extensions/subagent/index.ts` - registers `subagent` tool
- `.pi/extensions/subagent/agents.ts` - discovers repo/user agent definitions
- `.pi/agents/*.md` - repo-local agents (`scout`, `planner`, `worker`, `reviewer`)
- `.pi/prompts/subagent-*.md` - convenience chain prompts

Default behavior in this repo:

- `subagent` defaults to `agentScope: "project"`
- project-agent confirmation defaults to `false`
- child subagents run isolated `pi --mode json -p --no-session` processes

## Notes

- This is repo-local, not global user config.
- Global fallback file would be `~/.pi/agent/APPEND_SYSTEM.md`, but this repo currently uses the repo-local file.
- If you want to change the behavior instead of removing it, edit `.pi/APPEND_SYSTEM.md`.
