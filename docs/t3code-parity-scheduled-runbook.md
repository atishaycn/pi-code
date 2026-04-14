# T3 Code parity scheduled runbook

Last updated: **2026-04-13**

This is the repeatable operating procedure for scheduled parity runs against upstream `t3code`.

Use it together with:

- feature snapshot: [`docs/t3code-feature-map.md`](./t3code-feature-map.md)
- detailed implementation plan: [`docs/t3code-parity-delivery-plan.md`](./t3code-parity-delivery-plan.md)
- live UI: `/roadmap`
- upstream sync guide: [`docs/upstream-sync.md`](./upstream-sync.md)

---

## 1. Purpose

A scheduled parity run should:

1. refresh the upstream snapshot,
2. identify new missing or diverged features,
3. update the delivery docs and roadmap state,
4. implement the highest-value safe ports,
5. validate the repo fully,
6. leave behind clean artifacts for the next run.

This runbook is designed so later runs do **not** need to rediscover the process.

---

## 2. Cadence

Recommended cadence:

- **daily**: `sync:upstreams:check`, feature-map refresh, doc refresh, quick roadmap triage
- **2–3 times per week**: additive feature ports and validation
- **weekly**: full parity review, roadmap reprioritization, larger merge candidates

If upstream is moving quickly, prefer **shorter, smaller runs** over infrequent large merge batches.

---

## 3. Preconditions

Before starting a scheduled run, confirm:

- local clones of upstreams are available or remote refs are configured
- Bun and Node match repo expectations
- you can run quality gates locally
- no untracked generated artifacts are being mistaken for product changes

Expected toolchain:

- Bun `1.3.9`
- Node `24.13.1`

---

## 4. Inputs and reference repos

Primary upstreams:

- `t3code`
- `pi-mono`

Default local source paths used by this repo:

- `/Users/suns/Developer/t3code`
- `/Users/suns/Developer/pi-mono`

Primary local repo under work:

- `/Users/suns/Developer/t3code-pi`

---

## 5. Scheduled run phases

## Phase A — refresh upstream visibility

### Commands

```bash
bun run sync:upstreams:check
```

Review:

- `.artifacts/upstream-sync/<timestamp>/summary.md`
- `.artifacts/upstream-sync/<timestamp>/summary.json`
- `.upstream-sync/manifest.json`

### Goal

Understand what changed upstream before editing local code.

### Output

- a current safe-update/conflict view
- a candidate list of newly changed upstream files

---

## Phase B — refresh parity analysis

### Minimum analysis tasks

1. compare current `t3code` and `t3code-pi`
2. refresh `docs/t3code-feature-map.md` if the status changed materially
3. refresh `docs/t3code-parity-delivery-plan.md` if priorities, dependencies, or risks changed
4. update `/roadmap` data if new feature families or subtasks were identified

### Typical analysis commands

```bash
cd /Users/suns/Developer/t3code-pi

diff -rq /Users/suns/Developer/t3code /Users/suns/Developer/t3code-pi \
  -x .git -x node_modules -x .turbo -x dist -x dist-electron -x .artifacts

find /Users/suns/Developer/t3code/apps /Users/suns/Developer/t3code/packages -type f | sort
find /Users/suns/Developer/t3code-pi/apps /Users/suns/Developer/t3code-pi/packages -type f | sort
```

### Goal

Update the parity snapshot before deciding what to port.

---

## Phase C — choose the scheduled run scope

Each scheduled run should choose one of three scopes:

### Scope 1: docs + roadmap refresh only

Use this when upstream changed substantially but local merge work is not yet selected.

### Scope 2: additive low-risk implementation run

Preferred default. Candidate work:

- contracts
- shared utilities
- desktop hardening helpers
- additive web UI ports
- additive server helpers

### Scope 3: structural/high-risk merge run

Only when prerequisites are ready. Candidate work:

- auth control plane
- multi-environment routing
- provider/runtime composition changes
- server orchestration boundary changes

---

## 6. Required implementation order

Use this order unless there is a strong reason not to:

1. contracts
2. shared helpers
3. additive web UI
4. desktop hardening
5. additive server helpers
6. auth bootstrap backend
7. multi-environment routing and transport
8. high-risk provider/server convergence

This order minimizes breakage and preserves predictable recovery behavior.

---

## 7. Sub-agent execution pattern

Every scheduled run should use the same role pattern.

## Role map

### 1. Scout

Responsibilities:

- inspect upstream files relevant to the chosen feature family
- produce exact file inventory and diff notes
- identify local divergence and likely merge conflicts
- call out hidden dependencies before coding starts

Expected output:

- upstream files to port
- local files likely impacted
- conflict hot spots
- missing tests/docs to add

### 2. Planner

Responsibilities:

- translate scout output into an ordered implementation sequence
- separate pure helper ports from integration wiring
- define validation scope and rollback boundaries

Expected output:

- phase plan
- dependency order
- test plan
- cutover/rollback notes

### 3. Worker(s)

Responsibilities:

- implement the selected scope
- prefer parallel workers only when file overlap is low
- keep changes additive where possible

Typical parallelization:

- one worker for contracts/shared helpers
- one worker for UI
- one worker for server glue

### 4. Reviewer

Responsibilities:

- inspect correctness and maintainability
- verify no duplicated logic was introduced
- confirm the port matches project architecture priorities

### 5. Verifier

Responsibilities:

- run repo validation
- run targeted tests for the changed feature
- record any remaining blockers explicitly

---

## 8. Scheduled-run checklist

Use this exact checklist every time.

### Analysis checklist

- [ ] upstream sync check completed
- [ ] latest upstream ref captured
- [ ] feature map reviewed/updated
- [ ] delivery plan reviewed/updated
- [ ] roadmap UI/data reviewed/updated

### Implementation checklist

- [ ] feature scope selected
- [ ] sub-agent plan written down
- [ ] code changes made
- [ ] tests added or updated
- [ ] docs updated

### Validation checklist

- [ ] `bun fmt`
- [ ] `bun lint`
- [ ] `bun typecheck`
- [ ] `bun run test`
- [ ] `bun run roadmap:validate`
- [ ] roadmap subtasks updated to reflect reality

### Handoff checklist

- [ ] changed files summarized
- [ ] unresolved conflicts documented
- [ ] next-run starting point documented
- [ ] artifacts paths recorded

---

## 9. Validation commands

Run from repo root:

```bash
bun fmt
bun lint
bun typecheck
bun run test
```

To write the validation snapshot consumed automatically by `/roadmap`, run:

```bash
bun run roadmap:validate
```

If a run includes desktop-specific behavior, also run:

```bash
bun run test:desktop-smoke
```

If a run updates automation behavior, also review:

- `.artifacts/desktop-automation/`
- `.artifacts/automation-cycle/`

---

## 10. Artifact policy

Each scheduled run should leave behind:

- updated docs when priorities or status changed
- updated roadmap checklist state or data when scope changed
- test coverage for any behavior change
- a concise summary of:
  - what was updated
  - what remains blocked
  - what the next run should pick up first

Preferred artifact locations already used by the repo:

- `.artifacts/upstream-sync/`
- `.artifacts/desktop-automation/`
- `.artifacts/automation-cycle/`

---

## 11. Conflict handling

When upstream and local code both changed:

1. do **not** blindly overwrite local Pi integrations
2. classify the change:
   - safe additive upstream port
   - local-only customization to preserve
   - real semantic conflict
3. document the conflict in the delivery plan or the next-run summary
4. if necessary, split the work into:
   - helper extraction first
   - transport integration second
   - UX adoption third

High-risk conflict zones:

- `apps/server/src/provider/**`
- `apps/server/src/ws.ts`
- `apps/server/src/server.ts`
- `apps/server/src/orchestration/**`
- `apps/server/src/terminal/**`
- `apps/web/src/components/ChatView*`

---

## 12. Definition of a successful scheduled run

A scheduled run is successful when:

- upstream visibility was refreshed,
- the roadmap/docs are current,
- at least one meaningful parity increment landed or was explicitly deferred with reasons,
- validation completed,
- the next run has a clear starting point.

A run is **not** complete if it leaves undocumented blockers or silent validation failures.

---

## 13. Recommended default scheduled-run template

Use this template for most runs:

1. `bun run sync:upstreams:check`
2. refresh feature map + delivery docs
3. choose one low-risk additive feature family
4. scout upstream/local files
5. plan the cut into pure helpers vs integration wiring
6. implement
7. run validation
8. update `/roadmap` and docs
9. write next-run notes

Recommended default features for repeated scheduled runs:

- shared auth/environment contracts
- shared search ranking helper
- shared QR utility
- command palette
- desktop hardening helpers
- server runtime HTTP helpers

---

## 14. The scheduled source of truth

For future recurring runs, treat these as the source-of-truth stack in order:

1. `docs/t3code-feature-map.md`
2. `docs/t3code-parity-delivery-plan.md`
3. `docs/t3code-parity-scheduled-runbook.md`
4. `/roadmap`

If they disagree, update them until they converge before starting the next major implementation slice.
