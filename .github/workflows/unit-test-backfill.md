---
name: Unit Test Backfill
description: Uses the unit-test agent to add missing unit tests to the least-covered files of one application and opens a draft pull request with the verified tests.

on:
  workflow_dispatch:
    inputs:
      app:
        description: Application to backfill
        type: choice
        options: [backend, frontend]
        required: true
      max-files:
        description: Most source files to cover in this run (1 to 12)
        type: string
        default: "8"
  roles: [admin, maintainer, write]

timeout-minutes: 45

concurrency:
  group: unit-test-backfill-${{ inputs.app }}
  cancel-in-progress: false
  job-discriminator: ${{ github.run_id }}

permissions:
  contents: read
  pull-requests: read

imports:
  - shared/unit-test-agent.md
  - ../agents/unit-test-agent.agent.md

pre-agent-steps:
  - name: Measure the baseline and pick the targets
    env:
      APP: ${{ inputs.app }}
      MAX_FILES: ${{ inputs.max-files }}
    run: |
      RUN_DIR=/tmp/gh-aw/agent/test-agent
      mkdir -p "$RUN_DIR"
      for app in backend frontend; do
        node .github/test-agent/run-tests.mjs --app "$app" --out "$RUN_DIR/baseline/$app" || true
      done
      node .github/test-agent/select-targets.mjs --baseline "$RUN_DIR/baseline" --app "$APP" \
        --max "$MAX_FILES" --out "$RUN_DIR/targets.json"

jobs:
  detection:
    timeout-minutes: 30

safe-outputs:
  create-pull-request:
    patch-format: am
    title-prefix: "[unit-test-agent] "
    labels: [unit-test-agent]
    draft: true
    allowed-files:
      - "backend/tests/**"
      - "frontend/src/**/*.test.ts"
      - "frontend/src/**/*.test.tsx"
      - "frontend/src/test/**"
    protected-files: blocked
    fallback-as-issue: false
  noop:
  threat-detection:
    continue-on-error: false
    steps:
      - name: Check out the commit the agent started from
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.sha }}
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
          patch-dir: ${{ runner.temp }}/agent-artifact
          workspace: test-agent-workspace
---

# Unit test agent: backfill mode

Work in **backfill mode** on the `${{ inputs.app }}` application.

- `/tmp/gh-aw/agent/test-agent/targets.json` lists the source files to cover, least covered first, each with its
  current coverage and mapped test file.
- `/tmp/gh-aw/agent/test-agent/baseline/<app>/result.json` is the existing suite before your changes.

1. Take the targets in order. For each one, read the source file and its existing test, then decide `write`,
   `update` or `skip-not-testable` (with a reason). Aim for meaningful assertions on each file's public behavior,
   covering its branches and error paths. Coverage is a hint, not the goal.
2. Write the tests with `/gh-aw-workflow:writing-backend-tests` or `/gh-aw-workflow:writing-frontend-tests`.
3. Verify every test file you touched with `/gh-aw-workflow:verifying-tests`, then run the whole `${{ inputs.app }}`
   suite once with `run-tests.mjs --targets <all target files>`, and record the coverage before and after for the
   report.
4. Commit the test files with the message `test(${{ inputs.app }}): backfill unit tests [unit-test-agent]` and call
   `create_pull_request`. Title: `${{ inputs.app }}: backfill unit tests for <short scope>`. Body: your report,
   following `/gh-aw-workflow:reporting-test-results`, with a before and after coverage table per target file.
5. If no target needs tests, call `noop` with the reason.
