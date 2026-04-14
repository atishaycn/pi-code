import { DateTime, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  AuthAccessStreamEvent,
  AuthSessionState,
  ServerAuthDescriptor,
  type AuthSessionState as AuthSessionStateType,
} from "./auth";

const decodeAuthDescriptor = Schema.decodeUnknownSync(ServerAuthDescriptor);
const decodeAuthSessionState = Schema.decodeUnknownSync(AuthSessionState);
const decodeAuthAccessStreamEvent = Schema.decodeUnknownSync(AuthAccessStreamEvent);

describe("auth contracts", () => {
  it("decodes a server auth descriptor", () => {
    expect(
      decodeAuthDescriptor({
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["browser-session-cookie", "bearer-session-token"],
        sessionCookieName: "t3-auth",
      }),
    ).toEqual({
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie", "bearer-session-token"],
      sessionCookieName: "t3-auth",
    });
  });

  it("supports optional authenticated session fields", () => {
    const decoded: AuthSessionStateType = decodeAuthSessionState({
      authenticated: true,
      auth: {
        policy: "loopback-browser",
        bootstrapMethods: ["desktop-bootstrap"],
        sessionMethods: ["browser-session-cookie"],
        sessionCookieName: "loopback-session",
      },
      role: "owner",
      sessionMethod: "browser-session-cookie",
      expiresAt: DateTime.fromDateUnsafe(new Date("2026-04-13T18:00:00.000Z")),
    });

    expect(decoded.authenticated).toBe(true);
    expect(decoded.role).toBe("owner");
    expect(decoded.sessionMethod).toBe("browser-session-cookie");
  });

  it("decodes auth access stream snapshot events", () => {
    const decoded = decodeAuthAccessStreamEvent({
      version: 1,
      revision: 7,
      type: "snapshot",
      payload: {
        pairingLinks: [],
        clientSessions: [],
      },
    });

    expect(decoded.type).toBe("snapshot");
    if (decoded.type !== "snapshot") {
      throw new Error("Expected snapshot event");
    }
    expect(decoded.payload.pairingLinks).toEqual([]);
    expect(decoded.payload.clientSessions).toEqual([]);
  });
});
