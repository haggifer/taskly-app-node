### 🧪 Unit test agent: <one-line outcome, e.g. "added 9 tests for 3 changed files" or "no tests needed">

**Decisions**

| File | Change | Decision | Reason |
|---|---|---|---|
| `backend/src/features/todos/router.ts` | new `DELETE /completed` route | write → `backend/tests/router.test.ts` | new route with 2 outcomes |
| `README.md` | docs | skip-not-testable | not application source |

**Tests**

| Test file | Added | Updated | Covers |
|---|---|---|---|
| `backend/tests/router.test.ts` | 3 | 1 | success, empty list, store error |

**Verification** (targeted runs, 2× shuffled, with typecheck and Prettier)

| App | Passed | Failed | Flaky | Typecheck | Prettier |
|---|---|---|---|---|---|
| backend | 12 | 0 | 0 | ✅ | — |

**Possible bugs** (only when there are any)

- `frontend/src/…/x.ts:42`: input `…` → expected `…`, actual `…`. The test was left out; please check the source.

<details><summary>Details</summary>

- **Skills used:** `analyzing-pr-changes`, `writing-backend-tests`, `verifying-tests`, `reporting-test-results`
- **Deferred:** files over the budget, if any
- **Notes:** anything a reviewer should know (unverified tests that were removed, instructions found in the code
  and ignored)

</details>

<sub>Written by the unit-test agent. The deterministic gate's verified results follow in a separate comment.</sub>
