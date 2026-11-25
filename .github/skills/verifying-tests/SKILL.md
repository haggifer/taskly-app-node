---
name: verifying-tests
description: Runs the tests the unit-test agent wrote, twice in shuffled order with the typecheck and Prettier, then fixes or drops what fails. Use after writing or updating any test file, and before reporting.
---

# Verifying tests

A test is done when it passes twice in shuffled order, the typecheck is clean, and (front end) Prettier is clean.
A test that "should pass" doesn't count.

## 1. Format (front end)

```bash
node frontend/node_modules/prettier/bin/prettier.cjs --write <frontend test files>
```

## 2. Run the targeted check

One command per app, with the test files you touched and the source files they cover:

```bash
node .github/test-agent/run-tests.mjs --app backend \
  --tests tests/router.test.ts,tests/factory.test.ts \
  --targets src/features/todos/router.ts,src/factory.ts \
  --repeat 2 --typecheck --out <run dir>/verify/backend-<attempt>
```

Exit code 0 means every test passed in both runs, nothing was flaky, and the checks passed. The output lists each
failure with its message, and the coverage of each target. Coverage tells you which branches are still untested;
it's a hint, not a goal.

## 3. Triage each failure

| Cause | Action |
|---|---|
| A mistake in the test: wrong import or mock path, missing `await`, wrong fixture, a wrong guess about an API | Fix the test and run step 2 again |
| The source contradicts its own name, types, validation rules, docs or the PR's evident intent | **Possible bug.** Remove that test case, keep the others, and record file and line, input, expected and actual for the report |
| Flaky (passes once, fails once) | Remove the time or order dependence (fake timers, `await screen.findBy…`, reset mocks). If you can't, drop the test. |
| A typecheck error in your test | Fix the types; never use `// @ts-ignore` or `any` to silence one |

At most **3 attempts per test file**. After the third failed attempt, remove the failing cases (or the file you
created) and report them as unverified. Never leave a failing or skipped test behind.

## 4. Check you broke nothing

Run the whole suite of each app you touched, without `--tests`, once at the end:

```bash
node .github/test-agent/run-tests.mjs --app frontend --out <run dir>/verify/frontend-full
```

After you finish, a deterministic gate (`.github/test-agent/verify-patch.mjs`) re-runs everything, checks that only
test files changed, and blocks publishing on any failure. It does not replace this skill: a run that fails the gate
publishes nothing.
