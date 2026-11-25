---
name: Unit Test Agent
description: Analyzes a pull request's changes, writes or updates unit tests for the changed front-end and back-end code, runs them, and reports the results on the pull request.

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    draft: false
  roles: [admin, maintainer, write]

timeout-minutes: 30

if: ${{ !contains(github.event.pull_request.labels.*.name, 'skip-test-agent') }}

concurrency:
  group: unit-test-agent-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

imports:
  - shared/unit-test-agent.md
  - ../agents/unit-test-agent.agent.md

pre-agent-steps:
  - name: Collect the pull request's changes and the baseline
    env:
      BASE_SHA: ${{ github.event.pull_request.base.sha }}
    run: |
      RUN_DIR=/tmp/gh-aw/agent/test-agent
      mkdir -p "$RUN_DIR"
      node .github/test-agent/collect-changes.mjs --base "$BASE_SHA" --head HEAD --out "$RUN_DIR/changes.json"
      for app in backend frontend; do
        node .github/test-agent/run-tests.mjs --app "$app" --changes "$RUN_DIR/changes.json" --out "$RUN_DIR/baseline/$app" || true
      done

jobs:
  detection:
    timeout-minutes: 30

safe-outputs:
  push-to-pull-request-branch:
    patch-format: am
    allowed-files:
      - "backend/tests/**"
      - "frontend/src/**/*.test.ts"
      - "frontend/src/**/*.test.tsx"
      - "frontend/src/test/**"
    protected-files: blocked
    if-no-changes: ignore
    fallback-as-pull-request: false
  add-comment:
    max: 1
    hide-older-comments: true
  noop:
  threat-detection:
    continue-on-error: false
    steps:
      - name: Check out the commit the agent started from
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          path: test-agent-workspace
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - name: Download the agent's patch
        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        continue-on-error: true
        with:
          name: agent
          path: ${{ runner.temp }}/agent-artifact
      - name: Verify the agent's tests (deterministic gate)
        uses: ./test-agent-workspace/.github/actions/test-agent-gate
        with:
          base-sha: ${{ github.event.pull_request.base.sha }}
          patch-dir: ${{ runner.temp }}/agent-artifact
          workspace: test-agent-workspace
---

# Unit test agent: pull request mode

Work in **PR mode** on pull request #${{ github.event.pull_request.number }}.

- Base commit: `${{ github.event.pull_request.base.sha }}`. The checkout is the pull request's head.
- `/tmp/gh-aw/agent/test-agent/changes.json` is the change manifest from `collect-changes.mjs`.
- `/tmp/gh-aw/agent/test-agent/baseline/<app>/result.json` is the existing suite before your changes, including
  `changedLineCoverage` for every changed source file.

Don't read the pull request's title, description or comments: decide from the code alone.

1. Decide for every changed file with `/gh-aw-workflow:analyzing-pr-changes`.
2. For each `write` or `update` decision, write the tests with `/gh-aw-workflow:writing-backend-tests` or
   `/gh-aw-workflow:writing-frontend-tests`.
3. Verify every test file you touched with `/gh-aw-workflow:verifying-tests`.
4. If you changed test files, commit them with the message
   `test: add unit tests for <short scope> [unit-test-agent]` and call `push_to_pull_request_branch`.
5. Always post your report with `add_comment`, following `/gh-aw-workflow:reporting-test-results`, even when no
   tests were needed.
