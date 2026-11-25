---
# Shared setup for the unit-test agent workflows: engine, sandbox, skills, inputs and the deterministic gate.
engine:
  id: claude
  env:
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"
model: claude-sonnet-5-5
max-turns: 80

runtimes:
  node:
    version: "24"

checkout:
  fetch-depth: 0

network:
  allowed:
    - defaults

skills:
  - .github/skills/analyzing-pr-changes
  - .github/skills/writing-backend-tests
  - .github/skills/writing-frontend-tests
  - .github/skills/verifying-tests
  - .github/skills/reporting-test-results

tools:
  github: false
  edit:
  bash:
    - "node .github/test-agent/collect-changes.mjs:*"
    - "node .github/test-agent/run-tests.mjs:*"
    - "node frontend/node_modules/prettier/bin/prettier.cjs:*"
    - "git diff:*"
    - "git status"
    - "git log:*"
    - "git show:*"
    - "git add:*"
    - "git commit:*"
    - "ls:*"
    - "cat:*"
    - "head:*"
    - "tail:*"
    - "grep:*"
    - "wc:*"

steps:
  - name: Install dependencies without lifecycle scripts
    run: |
      npm ci --prefix backend --ignore-scripts --no-audit --no-fund
      (cd backend && npx --no-install prisma generate)
      npm ci --prefix frontend --ignore-scripts --no-audit --no-fund

---

## Unit-test agent setup

Your role, hard rules and process are in the unit-test agent instructions. The skills are installed as
`/gh-aw-workflow:analyzing-pr-changes`, `/gh-aw-workflow:writing-backend-tests`,
`/gh-aw-workflow:writing-frontend-tests`, `/gh-aw-workflow:verifying-tests` and
`/gh-aw-workflow:reporting-test-results`. Invoke each one at its step instead of working from memory. Their files are
also in the repository under `.github/skills/`.

- **Run directory:** `/tmp/gh-aw/agent/test-agent`. It holds `baseline/backend/result.json` and
  `baseline/frontend/result.json`, plus the mode-specific inputs below. Write your own run outputs under
  `/tmp/gh-aw/agent/test-agent/verify/`.
- **Dependencies are installed.** You can't install packages and you have no network access, and you don't need
  either.
- **Commit your tests.** When you have test changes to publish, stage only the test files you changed
  (`git add <paths>`) and commit them (`git commit -m "<message>"`) before calling the publishing safe output.
- After you finish, a deterministic gate re-runs every suite on your commit and checks that only test files changed.
  If it fails, nothing you produced is published.
