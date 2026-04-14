# Wiki change log

## 2026-04-14

- Created initial repo wiki for agent-facing project memory.
- Added pages for overview, architecture, package map, runtime/data flow, pi provider integration, workflows, testing, operations, and glossary.
- Added `bun run wiki:lint` validation script to catch broken wiki links and missing core files.
- Documented desktop startup regression where wildcard/IPv6 port collision let desktop renderer connect to wrong server state and show only `server` project.
- Added wiki notes for fixed desktop backend port probing across `127.0.0.1`, `0.0.0.0`, and `::`, plus safer restart/debug commands.
- Added `scripts/restart-desktop-clean.sh` and `bun run restart:desktop` for repeatable packaged desktop rebuild/restart flow.
- Added embedded pi full-autonomy provider setting: `providers.codex.fullAutonomy` now passes `--full-autonomy` when starting new pi-backed sessions; settings UI documents that it applies only to newly started sessions.
- Fixed desktop startup race where renderer could show transient `Cannot reach the T3 server` and sometimes open with empty projects despite populated desktop sqlite state. Desktop now waits for backend readiness before opening renderer, and web bootstrap now fetches orchestration snapshot even without relying solely on welcome-event timing.
- Added repo-local pi subagent setup under `.pi/`: `subagent` tool extension, project agent definitions (`scout`, `planner`, `worker`, `reviewer`), chain prompt templates, and system-prompt guidance so repo sessions can delegate isolated recon/planning/review/implementation work.
- Isolated embedded pi agent homes from user-global extensions/packages during RPC startup. Embedded runs now isolate either configured `providers.codex.homePath` or default `~/.pi/agent`, copy auth/models into an app-managed temp agent dir, and sanitize copied `settings.json` so project-local `.pi/extensions/` still load but conflicting global extension tools do not crash session startup.
- Added edit-from-history chat flow in web UI. User messages now expose an edit action beside copy; sending from that mode rewinds thread to checkpoint before selected message, discards newer turns in same thread, and resends edited text as the next turn.
- Added persisted sidebar/thread-status diagnostics logs. Web now writes per-thread NDJSON records under `${logsDirectoryPath}/thread-status/<thread-id>.ndjson` whenever sidebar status decision inputs change, including previous/next snapshots, decision reasons, message window context, and recent activities.
- Added chat timeline subagent blocks. Web now parses `collab_agent_tool_call` payloads into normalized single/series/parallel delegation cards with per-agent task blocks, chain handoff labels, result summaries, and inline progress updates inside `MessagesTimeline`.
- Fixed pi late-event lifecycle mismatch that could flip threads from `Working` to `Completed` too early. `PiCodexAdapter` now keeps a short completion quiet window after `turn_end` / `agent_end`, rebinding late tool and assistant activity to the same active turn so sidebar/chat stay `Working` until work actually settles, then switch to `Completed`.
- Fixed repo-local subagent launcher fallback in `.pi/extensions/subagent/index.ts`. Child agents now prefer `PI_AUTOREASON_LAUNCHER` when present, avoiding broken direct `node .../src/cli.ts` execution in local tsx/dev Pi installs.
- Fixed stop/interrupt parity for pi-backed web chats. Web stop now dispatches `thread.turn.interrupt` with active orchestration `turnId`, and sidebar unseen-completion pills now require `latestTurn.state === "completed"` so interrupted/aborted turns no longer show green `Completed` like successful finishes.
- Fixed provider/read-model drift where live same-turn runtime could stop refreshing web `Working` state, and resumed runtime on a newer provider turn could stay stuck on older completion state. `ProviderRuntimeIngestion` now refreshes running-session heartbeats from live turn-scoped runtime events and can re-adopt provider-confirmed active turns when resumed work arrives before a fresh `turn.started` reaches the web read model.
