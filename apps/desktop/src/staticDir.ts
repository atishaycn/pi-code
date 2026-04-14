import * as Path from "node:path";

export function resolveDesktopStaticDirCandidates(input: {
  appRoot: string;
  isPackaged: boolean;
}): string[] {
  const bundledServerClient = Path.join(input.appRoot, "apps/server/dist/client");
  const monorepoWebDist = Path.join(input.appRoot, "apps/web/dist");

  return input.isPackaged
    ? [bundledServerClient, monorepoWebDist]
    : [monorepoWebDist, bundledServerClient];
}
