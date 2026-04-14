import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ExecutionEnvironmentDescriptor, RepositoryIdentity, ScopedThreadRef } from "./environment";

const decodeExecutionEnvironmentDescriptor = Schema.decodeUnknownSync(
  ExecutionEnvironmentDescriptor,
);
const decodeRepositoryIdentity = Schema.decodeUnknownSync(RepositoryIdentity);
const decodeScopedThreadRef = Schema.decodeUnknownSync(ScopedThreadRef);

describe("environment contracts", () => {
  it("defaults execution environment capabilities", () => {
    const decoded = decodeExecutionEnvironmentDescriptor({
      environmentId: "env-primary",
      label: "Primary desktop",
      platform: {
        os: "darwin",
        arch: "arm64",
      },
      serverVersion: "0.0.1",
      capabilities: {},
    });

    expect(decoded.capabilities.repositoryIdentity).toBe(false);
  });

  it("decodes repository identity metadata", () => {
    const decoded = decodeRepositoryIdentity({
      canonicalKey: "github:owner/repo",
      locator: {
        source: "git-remote",
        remoteName: "origin",
        remoteUrl: "https://github.com/owner/repo.git",
      },
      provider: "github",
      owner: "owner",
      name: "repo",
    });

    expect(decoded.locator.remoteName).toBe("origin");
    expect(decoded.provider).toBe("github");
  });

  it("decodes scoped thread references", () => {
    expect(
      decodeScopedThreadRef({
        environmentId: "env-primary",
        threadId: "thread-123",
      }),
    ).toEqual({
      environmentId: "env-primary",
      threadId: "thread-123",
    });
  });
});
