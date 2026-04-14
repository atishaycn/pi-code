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
