import * as NodeServices from "@effect/platform-node/NodeServices";

import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Option, Path } from "effect";

import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
  readPersistedServerRuntimeState,
} from "./serverRuntimeState.ts";

it.effect("normalizes wildcard hosts to a loopback runtime origin", () =>
  Effect.sync(() => {
    const state = makePersistedServerRuntimeState({
      config: { host: "0.0.0.0" },
      port: 3773,
    });

    assert.equal(state.origin, "http://127.0.0.1:3773");
    assert.equal(state.host, "0.0.0.0");
  }),
);

it.effect("formats explicit IPv6 hosts as bracketed origins", () =>
  Effect.sync(() => {
    const state = makePersistedServerRuntimeState({
      config: { host: "::1" },
      port: 3773,
    });

    assert.equal(state.origin, "http://[::1]:3773");
  }),
);

it.effect("persists, reads, and clears runtime state snapshots", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-server-runtime-state-" });
    const statePath = path.join(tempDir, "server-runtime.json");
    const state = makePersistedServerRuntimeState({
      config: { host: "127.0.0.1" },
      port: 4123,
    });

    yield* persistServerRuntimeState({
      path: statePath,
      state,
    });

    const restored = yield* readPersistedServerRuntimeState(statePath);
    assert.deepStrictEqual(restored, Option.some(state));

    yield* clearPersistedServerRuntimeState(statePath);

    const cleared = yield* readPersistedServerRuntimeState(statePath);
    assert.deepStrictEqual(cleared, Option.none());
  }).pipe(Effect.provide(NodeServices.layer)),
);
