const DEFAULT_GITHUB_REPO = "suns/t3code-pi";

function normalizeGitHubRepo(value: string | undefined): string {
  const repo = value?.trim();
  if (!repo) {
    return DEFAULT_GITHUB_REPO;
  }

  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length > 0) {
    return DEFAULT_GITHUB_REPO;
  }

  return `${owner}/${name}`;
}

export const GITHUB_REPO = normalizeGitHubRepo(import.meta.env.PUBLIC_GITHUB_REPO);
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
