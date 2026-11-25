# Unit test agent: solution notes

A custom Claude Code agent with five reusable skills writes and updates Vitest unit tests for this repository's
React front end and Express + Prisma back end. It runs on GitHub Actions for every pull request and on demand for
coverage backfills. Deterministic tooling decides what can be trusted: the agent proposes tests, a gate verifies
them on a fresh runner, and only then does a separate job publish them to the pull request.

```
pull_request ──► agent job (read-only token) ──► gate job (fresh runner) ──► publish job (write token)
                 Claude Code + custom agent        apply patch, re-run every     push the tests if the gate
                 + skills + toolkit                 suite, typecheck, Prettier,   passed, start CI, post one
                 commits tests locally,             scope and coverage checks     results comment
                 writes report.md
```

## 1. Main technical decisions

| Decision | Why |
|---|---|
| **Claude Code as the agent environment**, run headless (`claude -p --agent unit-test-agent`) | Native custom agents (`.claude/agents/`) and Agent Skills (`.claude/skills/`), tool allowlists, hooks, an OS-level sandbox and a non-interactive permission mode. The same agent and skills work locally in Claude Code, so a developer can run exactly what CI runs. I built the first version on GitHub Agentic Workflows. I moved because its Claude engine needs an API key, and because it passes a custom agent as prompt text rather than running it as an agent. The job split here mirrors gh-aw's: read-only agent, then a verification gate, then a separate job that publishes. |
| **LLM for judgment, code for facts** | The agent decides what to test and writes the tests. Plain Node scripts (`.github/test-agent/`, with their own `node:test` suite) compute the change manifest, run Vitest, measure changed-line coverage and check the patch. Numbers on the PR come from those scripts, never from the agent's text. |
| **Three jobs with separate privileges** | The agent job reads untrusted code and holds the model token, so it gets a read-only `GITHUB_TOKEN` and no Git credentials. The gate job re-checks the agent's patch on a clean runner. Only the publish job can write, and it never runs repository code: it applies a patch and calls the GitHub API. |
| **The gate fails closed** | The gate applies the agent's exact patch to the commit it started from. It refuses the patch if any file outside the test globs changed, or on `.only`/`.skip`, deleted tests, more than 30 files or 300 KB, a red test, a typecheck or Prettier failure, or a coverage-threshold failure. Then nothing is pushed, and the comment says why. |
| **Defense in depth for write scope** | The same rule ("test files only") is enforced four times: in the agent's instructions, by a `PreToolUse` hook, by the gate, and by a last path check in the publish job before `git am`. The hook denies `Edit`/`Write` outside the test globs (symlinks resolved), and denies any shell command with pipes, redirection, `;`, `&&`, substitution or `--output`. It checks `git add` and `git commit` against a strict grammar: only plain test-file paths can be staged, and only `-m "<message>"` is accepted. The shell allowlist holds only the toolkit scripts and read-only or commit `git` commands. Toolkit outputs are confined to the run directory, and Prettier runs through `format-tests.mjs`, which accepts test files only. |
| **What gets published is exactly what was verified** | The agent's commit is packaged after the agent exits, into a directory it never had access to. The gate applies exactly that `agent.patch` and records its SHA-256. The publish job refuses a patch whose hash differs. |
| **The agent's commands run in a sandbox** | Claude Code's OS-level sandbox (bubblewrap on Linux) runs every Bash command the agent issues, including Vitest and the test code it wrote. Those commands get their own PID and network namespaces (no outbound network, and the Claude Code process is invisible), can write only to the checkout and the run directory, and have the token variables removed from their environment. `failIfUnavailable` makes the run fail rather than continue unsandboxed. A probe on a hosted runner confirmed it: a sandboxed process sees only PIDs 1, 2 and 7, and none has the token. |
| **Keeping the model token out of the output** | Subprocesses get a scrubbed environment, reads of `/proc` and `/sys` are denied, and every packaged file is scanned for the token value and for token-shaped strings before upload. A hit discards the whole run. |
| **Skills encode this repository's conventions** | The existing tests are the style guide: design-system mocks, child-component mocks, `todoFixture`, Prisma delegate spies, Supertest on a bare router. The skills write those down, so new tests look like the old ones instead of generic ones. |
| **The PR can't change the agent that reviews it** | In PR runs, the agent's instructions, skills, settings and write guard (`.claude/`, `.github/test-agent/`) and the gate's code come from the base branch. They're extracted into root-owned, read-only copies before any PR code runs, and put back into the checkout as the last step before the agent. `CLAUDE.md` and `.mcp.json` files from the PR are removed, and Claude runs with `--strict-mcp-config`. A PR that changes these files gets a notice, and its changes apply only once merged. |
| **PR code outside the agent is sandboxed too** | The baseline runs (agent job and gate) and the gate's verification run tests in bubblewrap (`sandboxed.sh`): no network, read-only except the checkout and the output folder, and no access to the runner's command files (`GITHUB_ENV`, `GITHUB_OUTPUT`…) or tokens. What decides the verdict (starting commit, patch hash) is recorded as step outputs before any PR code runs. |
| **Two shuffled runs before anything counts** | `run-tests.mjs --repeat 2` re-runs tests in shuffled order and reports flaky tests, so order or timing dependence doesn't slip through. |
| **One sticky comment per PR** | Re-runs update the same comment (the agent's report, then the gate's verified results) instead of piling up. |

## 2. Running it

**Prerequisites**

- GitHub Actions enabled. The workflows pin every action by commit SHA and Claude Code to an exact version.
- Repository secret `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token` on a Claude Pro or Max account. A team
  would use an Anthropic API key or workload identity federation instead (see § 7).
- Optional: *Settings → Actions → General → Allow GitHub Actions to create pull requests*, so the backfill workflow
  can open its draft PR. Without it, the workflow pushes the branch and prints a link to open the PR.

**Pull requests:** open or update a PR from a branch of this repository. `Unit Test Agent` runs automatically and
skips drafts, PRs from forks, and PRs labelled `skip-test-agent`.

**Backfill:** *Actions → Unit Test Backfill → Run workflow*, pick `backend` or `frontend` (or
`gh workflow run unit-test-backfill.yml -f app=backend`).

**Locally**, with Claude Code installed and dependencies in place, from the repository root:

```bash
claude --agent unit-test-agent   # then describe the task, or paste the prompt the workflow uses
node --test ".github/test-agent/tests/*.test.mjs"   # the toolkit's own tests
```

## 3. Where the agent and skills live, and how they're used

| Path | Role |
|---|---|
| `.claude/agents/unit-test-agent.md` | The custom agent: role, hard rules, inputs, process, definition of done. It preloads the five skills and is limited to `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Skill`. |
| `.claude/skills/analyzing-pr-changes/` | Step 1 (PR mode): a decision per changed file (`write`, `update`, `skip-covered`, `skip-not-testable`, `report-only`) with a reason. |
| `.claude/skills/writing-backend-tests/` | Step 2: Vitest + Supertest patterns per layer (repository, router, app factory, config, lifespan) and the traps found in a dry run. |
| `.claude/skills/writing-frontend-tests/` | Step 2: RTL patterns, design-system mocks, TanStack Query hooks, `fetch` stubs, fake timers. |
| `.claude/skills/verifying-tests/` | Step 3: targeted run (2× shuffled, typecheck, Prettier), failure triage (test mistake, possible bug, flaky), the 3-attempt limit. |
| `.claude/skills/reporting-test-results/` | Step 5: the report format, with every number taken from a command that ran. |
| `.github/test-agent/` | Deterministic toolkit: `collect-changes`, `run-tests`, `select-targets`, `verify-patch`, `format-tests`, the write-guard hook, `sandboxed.sh` (bubblewrap for PR code outside the agent), and `claude-settings.json` (allowlist, deny rules, sandbox, hook). Its own tests: `npm run test:agent-toolkit`. |
| `.github/actions/test-agent-gate/` | The gate as a composite action. |
| `.github/workflows/unit-test-agent-run.yml` | Reusable workflow: the agent job and the gate job. |
| `.github/workflows/unit-test-agent.yml`, `unit-test-backfill.yml` | Callers: the PR trigger and publishing, and the manual backfill with its draft PR. |

## 4. Example runs

### Backfill: adding the missing tests to the existing app

| Run | Agent's decisions | Tests | Line coverage (gate) |
|---|---|---|---|
| Back end, [PR #1](https://github.com/haggifer/taskly-app-node/pull/1) | `write` for config, lifespan, factory, health, database; `update` for the router; `skip-not-testable` for `main.ts` (only wiring) | 48 → 94, in 6 files | 33.0% → 97.2% |
| Front end, [PR #2](https://github.com/haggifer/taskly-app-node/pull/2) | `write` for 6 hooks, the HTTP client, the providers, the empty state, the page and the list (the last two in second test files, which led to the "one file per module" rule); `update` for the delete dialog | 18 → 73, in 13 files | 47.7% → 88.1% |
| Front end, second run, [PR #3](https://github.com/haggifer/taskly-app-node/pull/3) | the next least-covered files: `update` for the API client, utils, `useNotice`, form, editor and item tests; `skip-not-testable` for the delete dialog (only a defensive guard was left uncovered) | 73 → 117, in 6 files | 88.1% → 99.3% |

Each PR body is the agent's report: decisions, tests per file, the targeted verification results and before/after
coverage per target. The gate's verified results follow below the report. After the merges,
[PR #4](https://github.com/haggifer/taskly-app-node/pull/4) raised the coverage thresholds to 95% in both apps.

### Pull request: a new feature, end to end ([PR #5](https://github.com/haggifer/taskly-app-node/pull/5))

The feature, "Clear completed tasks", touches both apps: `DELETE /api/todos/completed`, a repository method, an API
client, a TanStack Query hook, a header button and page wiring. It was pushed with no new tests.

| Commit | Who | What happened |
|---|---|---|
| `8573b6b` | author | The feature without tests. CI fails: coverage drops below the 95% threshold. |
| `6bcfd7f` | agent | Skills used: `analyzing-pr-changes`, `writing-backend-tests`, `writing-frontend-tests`, `verifying-tests`, `reporting-test-results`. Decisions: `update` for the repository, router, API client and header tests; `write` for the new hook; new page tests; `skip-not-testable` for types, query keys and `openapi.json`. 22 tests, including one proving `DELETE /completed` isn't routed as `/:id`. The gate passed; CI is green. |
| `6a6b1ef` | author | The contract changes on purpose: the endpoint returns `{ deleted, ids }`, and the hook removes exactly those IDs from the cache. 5 of the agent's earlier tests now fail. |
| `b54267e` | agent | Spotted the 5 red tests at baseline, checked the source, both type files and the OpenAPI spec agree, and **updated** the 3 test files to the new contract, just as strict as before. It added the case the change exists for: a task completed after the request stays in the list. The gate passed (back end 98 tests, 97.4%; front end 136 tests, 99.4%); CI is green. |

The PR's single results comment shows the agent's decisions and the gate's verified numbers, and it was updated on
every run.

### When the agent should do nothing

- [PR #4](https://github.com/haggifer/taskly-app-node/pull/4) (coverage thresholds only): both config files
  `skip-not-testable`, nothing pushed, and the report notes that the current coverage already meets the new
  thresholds.
- [PR #6](https://github.com/haggifer/taskly-app-node/pull/6) changed the agent's own files. Its run used the base
  branch's versions and said so, then classified every file as outside the applications.
- The first runs, before the sandbox was configured, had no working shell. The agent drafted tests but committed
  nothing, because "only verified tests are published", and its report explained why. That's the fail-closed rule
  holding when the model was the only line of defense.

### How the agent was tuned

Before any CI run, a dry run of the agent and skills on a local copy took the back end from 33% to 96%. It also
surfaced gaps in the instructions: a relative-path bug in the toolkit, the asynchronous `listen` trap in
`lifespan.ts`, `process.once` leaking signal handlers, and `.env` loading in `config.ts`. They became skill text. The
real backfill hit those traps and handled them. Later runs led to two more changes: one test file per module, and
an explicit rule for updating tests when a PR changes behavior on purpose.

## 5. Assumptions

- Only collaborators with write access open PRs from branches of this repository. PRs from forks never run the
  agent, so they never reach the token or the budget.
- "Unit tests" means tests that need no database or network. The existing tests set that bar (Prisma delegates are
  spied on, `fetch` is stubbed), and the agent follows it.
- The design system is out of scope for unit tests, as in the base coverage configuration (it has Storybook
  stories).
- Tests describe intended behavior. When behavior looks wrong, the agent reports a possible bug instead of
  encoding it.

## 6. Limitations

- **The sandbox runs without its seccomp layer.** GitHub-hosted runners can't nest user namespaces, which Claude
  Code's seccomp helper needs. That layer only blocks Unix sockets, so the workflow allows Unix sockets and stops
  Docker before the agent starts: the Docker socket is the one that would let a process leave the sandbox. A
  self-hosted runner that allows nested namespaces would restore the full sandbox.
- **The sandbox covers the agent's commands, not the whole job.** The Claude Code process itself talks to the model
  API outside the sandbox, and so do its hooks. The trust boundary is write access to the repository: anyone with
  it could already change the workflow itself.
- **Dependency installation isn't sandboxed.** `npm ci --ignore-scripts` runs no package scripts, but
  `prisma generate` runs the Prisma CLI from the PR's lockfile, unsandboxed. That's the same trust as the PR author.
- **The gate's verdict is its exit status; its summary is not.** The tests run in the gate's sandbox with write
  access to the checkout and the output folder. Test code could rewrite the summary the comment shows, but not the
  pass or fail decision.
- **No model-based threat scan of the patch.** The gate's checks are structural (paths, size, focus/skip, results),
  not semantic.
- **CI on the agent's commit is dispatched, not triggered.** Pushes made with `GITHUB_TOKEN` don't trigger
  `pull_request` workflows, so the publish job starts `ci.yml` with `workflow_dispatch`. Pull requests the backfill
  opens do start `pull_request` runs, but GitHub holds them for approval (the Actions bot counts as a first-time
  contributor). That's left that way on purpose: it means the agent never runs on its own pull requests.
- **Non-determinism.** Two runs on the same PR can produce different tests. The gate guarantees they pass, not that
  they're the best possible tests.
- **Subscription token.** `CLAUDE_CODE_OAUTH_TOKEN` is tied to one person's Claude plan and its usage limits. When a
  run hits the limit, it publishes nothing.
- **Unit tests only.** No integration tests against PostgreSQL, no end-to-end tests, no mutation testing.

## 7. For production

- Run on an organization identity: an Anthropic API key with a spend limit, or workload identity federation, never
  a personal token. Alternatively, move the same agent and skills to GitHub Agentic Workflows, which adds an egress
  firewall, a model-based threat scan and safe outputs out of the box.
- Add an egress allowlist for the whole agent and gate jobs (for example a hardened runner in block mode), not only
  the sandboxed commands. Run test commands as a separate OS user or in a container, so test code can't reach the
  agent process at all.
- Use a GitHub App token for publishing, so the agent's commit triggers CI normally and appears as a bot.
- Measure quality, not just pass rate: mutation testing on the changed lines (do the new tests fail when the code
  is broken?), plus an evaluation set of past PRs with known-good tests to compare prompts, skills and models.
- Track cost and latency per run, and cap them per repository.
- Make the conventions data: generate the skills' "patterns" sections from the repository's own tests, so they stay
  in sync as the codebase changes.
