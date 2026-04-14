import { GITHUB_LATEST_RELEASE_API_URL, GITHUB_RELEASES_URL } from "./site";

export const RELEASES_URL = GITHUB_RELEASES_URL;

const API_URL = GITHUB_LATEST_RELEASE_API_URL;
const CACHE_KEY = "pi-code-latest-release";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export async function fetchLatestRelease(): Promise<Release> {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const data = await fetch(API_URL).then((r) => r.json());

  if (data?.assets) {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }

  return data;
}
