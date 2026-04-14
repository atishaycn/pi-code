# Automation cycle context

- Repo: /Users/suns/Developer/t3code-pi
- Artifact dir: /Users/suns/Developer/t3code-pi/.artifacts/automation-cycle/2026-04-12T07-49-56-445Z
- Program file: /Users/suns/Developer/t3code-pi/.automation/program.md
- Goal: improve reliable desktop automation without getting stuck.
- Inputs: screenshots, page HTML/text, summary.json, page-console.json, error.json if present.
- Constraints: preserve real Pi desktop behavior, keep changes maintainable, run bun fmt/lint/typecheck after code changes.

- Scenario: steer-queue
- Prompt: Inspect this repo and summarize where Pi runtime integration and processing-state UI live. Use repo tools if needed.
- Steer prompt: Actually focus on ChatView processing states and queued follow-up behavior. Use repo tools if needed.
  Read the program file, then inspect the artifact dir and propose the next small automation improvement.
  Default bridge command syncs this bundle into /tmp/autoresearch when that repo exists.
