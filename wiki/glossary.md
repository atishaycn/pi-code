# Glossary

Short repo terms. For deeper details, see contracts and architecture pages.

## Core domain

### Project

Top-level workspace record. Usually one repo/workspace root plus many threads.

### Workspace root

Filesystem root path for a project.

### Thread

Durable conversation unit with messages, activities, checkpoints, session state, branch/worktree metadata.

### Turn

One user-to-assistant work cycle.

### Latest turn

Projected summary for current/most recent turn shown in UI. Not raw provider state.

## Orchestration

### Orchestration

Server-side event-sourced domain model.

### Command

Typed request to change domain state.

### Event / domain event

Persisted fact that already happened.

### Decider

Pure logic that turns command + read model into event base(s).

### Projection

Read-optimized state derived from events.

### Read model

Current materialized view of projects, threads, messages, activities, checkpoints, sessions.

### Receipt

Typed async milestone signal used by tests/reactors instead of polling.

### Quiesced

Turn follow-up work has gone idle enough to consider processing settled.

## Provider runtime

### Provider

Actual agent backend implementation.

### Adapter

Provider-specific implementation behind generic provider service interface.

### Provider binding

Persisted thread -> provider/runtime metadata mapping used for session recovery.

### Session

Live provider-backed runtime attached to thread.

### Resume cursor

Persisted token/payload used to recover prior session state. In pi path, often session file info.

### Runtime event

Canonical provider event emitted by adapter before orchestration normalization.

## pi-specific

### PiCodexAdapter

Main pi runtime adapter. Name reflects codex-first contract history.

### PiRpcProcess

Wrapper around embedded pi launcher / RPC session process.

### Steering mode / follow-up mode

pi runtime controls exposed through server runtime APIs.

### Auto-compaction

pi runtime/session feature for compaction behavior, surfaced through runtime control APIs.

## Checkpointing and git

### Checkpoint

Git ref snapshot for thread workspace at a turn boundary.

### Baseline checkpoint

Pre-turn checkpoint used as diff start.

### Turn diff

Diff summary between turn checkpoints, projected into thread state.

### Worktree

Git worktree used as isolated thread workspace when enabled.

## Client/UI

### Native API

UI-facing API abstraction. In web/desktop, usually implemented by WebSocket transport plus desktop bridge helpers.

### Sidebar summary

Derived lightweight thread summary used by sidebar, not full thread object.

### Streaming assistant message

Assistant message still receiving deltas.

## Infra

### Drainable worker

Queue-backed async worker with deterministic `drain()` method for tests and reactors.

### Startup gate / command gate

Server startup mechanism that queues command work until runtime ready.

### Lifecycle event

Server startup/readiness event stream separate from orchestration domain events.
