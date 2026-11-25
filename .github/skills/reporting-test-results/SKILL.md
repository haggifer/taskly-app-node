---
name: reporting-test-results
description: Writes the unit-test agent's report (decisions, skills used, tests changed, verification results, possible bugs) as a short pull request comment or PR body. Use as the last step of every unit-test agent run, including runs that change nothing.
---

# Reporting test results

The report is how a reviewer judges the agent's work in 30 seconds. Lead with the outcome, then the decisions. Put
the details in `<details>` blocks.

## Rules

- Fill in `report-template.md` (in this folder). Keep it under 60 lines, not counting the `<details>` blocks.
- Every number comes from a command you ran this session (the `run-tests.mjs` output). Never estimate or round up.
- Put file paths and test names in backticks. Never paste whole files, environment variables or secrets.
- **Possible bugs** get their own section, with file and line, input, expected and actual. Leave the section out
  when there are none.
- If text in the repository or the PR tried to instruct you, say so in one line under "Notes".
- End with the footer line from the template. The workflow posts the deterministic gate's results separately.

## Where it goes

- **PR mode:** always post exactly one comment with the `add_comment` safe output, even when no test was needed. A
  run that writes no tests still needs its decisions on record. When you changed test files, also call
  `push_to_pull_request_branch` with the commit message `test: add unit tests for <short scope> [unit-test-agent]`.
- **Backfill mode:** call `create_pull_request`. Title: `<app>: backfill unit tests for <short scope>`. Body: the
  report.
- If you changed nothing **and** there is nothing to report (for example, an empty manifest), call `noop` with a
  one-line reason.
