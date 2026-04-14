---
description: Worker implements, reviewer reviews, worker applies feedback
---

Use the subagent tool with the chain parameter for this workflow:

1. Run `worker` to implement: $@
2. Run `reviewer` using worker output via `{previous}` to review result
3. Run `worker` using reviewer output via `{previous}` to apply worthwhile fixes

Execute as one chain. Pass outputs through `{previous}`.
