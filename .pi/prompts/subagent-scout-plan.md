---
description: Scout gathers context, planner returns plan without implementation
---

Use the subagent tool with the chain parameter for this workflow:

1. Run `scout` on: $@
2. Run `planner` using scout output via `{previous}` to build concrete plan for `$@`

Execute as one chain. Pass outputs through `{previous}`. Do not implement.
