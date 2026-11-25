---
name: analyzing-pr-changes
description: Decides, for every file a pull request changed, whether its unit tests must be written, updated, or left alone, and why. Use at the start of a unit-test agent run in PR mode, before writing any test.
---

# Analyzing PR changes

The goal is one decision per changed file that a reviewer would agree with. Writing tests for a README change, or
skipping a changed validation rule because "coverage looks fine", are both wrong answers.

## 1. Read the manifest

`<run dir>/changes.json` lists every changed file with `kind`, `status`, `changedLines`, `testFile` and
`testFileExists`. If the file is missing, create it:

```bash
node .github/test-agent/collect-changes.mjs --base <base sha> --head HEAD --out <run dir>/changes.json
```

## 2. Decide by kind first

| `kind` / `status` | Decision |
|---|---|
| `other` (docs, config, styles, lockfiles, workflows) | `skip-not-testable`, with the manifest's reason |
| `excluded` (types, barrels, constants, design system, generated code) | `skip-not-testable`, with the manifest's reason |
| `source`, `deleted` | `report-only`: name the orphaned test file if `testFileExists`; never delete it |
| `test` | No decision of its own. Read it: the author's tests count as existing coverage in step 3. |
| `source`, added/modified/renamed | Go to step 3 |

## 3. Decide for each changed source file

1. Read the change: `git diff <base sha>...HEAD -- <path>`, then the whole file.
2. Classify it:
   - **Behavioral:** a new function, route, branch or error; a changed condition, return value, default,
     validation rule or side effect; a new prop or callback in a component.
   - **Non-behavioral:** a rename with no contract change, formatting, comments, types only, or code moved without
     changing its logic.
3. Check the existing tests: open `testFile` and search the test folder for imports of the module. Read the baseline
   coverage of the changed lines in `<run dir>/baseline/<app>/result.json` (`changedLineCoverage`: covered and
   uncovered line numbers per changed file).
4. Decide:

| Decision | When |
|---|---|
| `write` | Behavioral change and no test file exists |
| `update` | Behavioral change; a test file exists but no assertion checks the new outcome. Covered lines alone aren't enough: some `expect` must fail if the new behavior broke. |
| `skip-covered` | An existing assertion already checks the new behavior. Name that test. |
| `skip-not-testable` | Non-behavioral change, or wiring that a unit test can't check meaningfully. Say which. |

5. **Callers:** if the change alters a contract (signature, return shape, thrown error, HTTP status), list the tests
   of its direct callers whose assertions are now wrong or missing as `update` too.

## 4. Budget and priority

At most 12 source files. If there are more, take them in this order: validation and business rules → API handlers
and repositories → hooks and API clients → components → glue code. Report the rest as `deferred`.

## Output

Keep this table for the report: file, a one-line summary of the change, decision, reason, target test file.
