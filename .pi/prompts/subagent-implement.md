---
description: Scout gathers context, planner makes plan, worker implements
---

Use the subagent tool with the chain parameter for this workflow:

1. Run `scout` on: $@
2. Run `planner` using scout output via `{previous}` to build concrete plan for `$@`
3. Run `worker` using planner output via `{previous}` to implement plan

Execute as one chain. Pass outputs through `{previous}`.
