import { describe, expect, it } from "vitest";

import { resolveDesktopStaticDirCandidates } from "./staticDir";

describe("resolveDesktopStaticDirCandidates", () => {
  it("prefers apps/web/dist over server bundled client for non-packaged desktop runs", () => {
    expect(
      resolveDesktopStaticDirCandidates({
        appRoot: "/repo",
        isPackaged: false,
      }),
    ).toEqual(["/repo/apps/web/dist", "/repo/apps/server/dist/client"]);
  });

  it("prefers bundled server client for packaged desktop runs", () => {
    expect(
      resolveDesktopStaticDirCandidates({
        appRoot: "/Applications/Pi Code.app/Contents/Resources/app.asar.unpacked",
        isPackaged: true,
      }),
    ).toEqual([
      "/Applications/Pi Code.app/Contents/Resources/app.asar.unpacked/apps/server/dist/client",
      "/Applications/Pi Code.app/Contents/Resources/app.asar.unpacked/apps/web/dist",
    ]);
  });
});
