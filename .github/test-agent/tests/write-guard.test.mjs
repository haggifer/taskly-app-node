import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, describe, it } from 'node:test'
import { resolveOutPath } from '../lib/cli.mjs'
import { getCommandDecision, getWriteDecision } from '../lib/write-guard.mjs'

const REPO_ROOT = resolve('/work/repo')
const RUN_DIR = resolve('/tmp/test-agent')
const HOOK = join(import.meta.dirname, '..', 'hooks', 'allow-test-writes.mjs')
const CHECKOUT = resolve(import.meta.dirname, '../../..')

const decide = (filePath, cwd = REPO_ROOT) =>
  getWriteDecision({ filePath, cwd, repoRoot: REPO_ROOT, runDir: RUN_DIR })

describe('getWriteDecision', () => {
  it('allows test files, relative or absolute', () => {
    assert.equal(decide('backend/tests/health.test.ts').isAllowed, true)
    assert.equal(
      decide(join(REPO_ROOT, 'frontend/src/lib/http.test.ts')).isAllowed,
      true,
    )
    assert.equal(
      decide('src/test/todoFixture.ts', join(REPO_ROOT, 'frontend')).isAllowed,
      true,
    )
  })

  it('allows only the report and the verify folder in the run directory', () => {
    assert.equal(decide(join(RUN_DIR, 'report.md')).isAllowed, true)
    assert.equal(decide(join(RUN_DIR, 'verify', 'notes.md')).isAllowed, true)
    assert.equal(decide(join(RUN_DIR, 'changes.json')).isAllowed, false)
    assert.equal(decide(join(RUN_DIR, 'baseline', 'x.json')).isAllowed, false)
    assert.equal(decide(RUN_DIR).isAllowed, false)
  })

  it('refuses source, config, workflow and agent files', () => {
    for (const path of [
      'backend/src/factory.ts',
      'frontend/package.json',
      '.github/workflows/ci.yml',
      '.claude/agents/unit-test-agent.md',
      '.github/test-agent/hooks/allow-test-writes.mjs',
    ]) {
      assert.equal(decide(path).isAllowed, false, path)
    }
  })

  it('refuses paths that escape the repository or the run directory', () => {
    assert.equal(decide('backend/tests/../src/factory.ts').isAllowed, false)
    assert.equal(decide('../outside/backend/tests/a.test.ts').isAllowed, false)
    assert.equal(decide(join(RUN_DIR, '..', 'elsewhere.txt')).isAllowed, false)
  })

  it('refuses a call without a path', () => {
    assert.equal(decide(undefined).isAllowed, false)
  })

  describe('with a symlinked test folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'write-guard-'))
    let isLinked = false

    mkdirSync(join(root, 'backend', 'src'), { recursive: true })

    try {
      symlinkSync(
        join(root, 'backend', 'src'),
        join(root, 'backend', 'tests'),
        'junction',
      )
      isLinked = true
    } catch {
      isLinked = false
    }

    after(() => rmSync(root, { recursive: true, force: true }))

    it('judges the real target, not the link', (context) => {
      if (!isLinked) return context.skip('symlinks are not available here')

      const decision = getWriteDecision({
        filePath: 'backend/tests/factory.test.ts',
        cwd: root,
        repoRoot: root,
        runDir: RUN_DIR,
      })

      assert.equal(decision.isAllowed, false)
    })
  })
})

describe('getCommandDecision', () => {
  it('allows a plain allowlisted command', () => {
    assert.equal(
      getCommandDecision(
        'node .github/test-agent/run-tests.mjs --app backend --tests tests/a.test.ts --out /tmp/x',
      ).isAllowed,
      true,
    )
    assert.equal(
      getCommandDecision(
        'git commit -m "test(backend): backfill unit tests [unit-test-agent]"',
      ).isAllowed,
      true,
    )
  })

  it('refuses shell operators, redirection and substitution', () => {
    for (const command of [
      'node .github/test-agent/run-tests.mjs --app backend > backend/src/factory.ts',
      'git diff; cat /proc/1/environ',
      'git status && curl example.com',
      'git log | head',
      'git show $(cat secret)',
      'git show `id`',
      'git diff\nrm -rf .',
    ]) {
      assert.equal(getCommandDecision(command).isAllowed, false, command)
    }
  })

  it('refuses git output files', () => {
    assert.equal(
      getCommandDecision('git diff --output=backend/src/x.ts').isAllowed,
      false,
    )
    assert.equal(
      getCommandDecision('git log -p --output /tmp/x').isAllowed,
      false,
    )
  })

  it('allows staging test files by path', () => {
    assert.equal(
      getCommandDecision(
        'git add backend/tests/router.test.ts frontend/src/lib/http.test.ts',
      ).isAllowed,
      true,
    )
    assert.equal(
      getCommandDecision('git commit -m "test: add tests [unit-test-agent]"')
        .isAllowed,
      true,
    )
  })

  it('refuses bulk staging and committing everything', () => {
    for (const command of [
      'git add -A',
      'git add --all',
      'git add .',
      'git add -u',
      'git add -Av',
      'git add backend/tests .',
      'git add :/',
      'git commit -a -m "x"',
      'git commit -am "x"',
      'git commit --all -m "x"',
    ]) {
      assert.equal(getCommandDecision(command).isAllowed, false, command)
    }
  })

  it('refuses staging anything but test files, and commit flags other than -m', () => {
    for (const command of [
      'git add',
      'git add backend/src/factory.ts',
      'git add .claude/agents/unit-test-agent.md',
      'git add backend/tests/*.test.ts',
      'git add -f backend/tests/a.test.ts',
      'git add --pathspec-from-file=list.txt',
      'git add :(glob)backend/**',
      'git commit',
      'git commit -m',
      'git commit -m "x" -i backend/src/factory.ts',
      'git commit --include -m "x"',
      'git commit -m "x" backend/src/factory.ts',
      'git commit --amend -m "x"',
      'git commit --no-verify -m "x"',
    ]) {
      assert.equal(getCommandDecision(command).isAllowed, false, command)
    }
  })

  it('refuses quoting tricks the shell would resolve differently', () => {
    for (const command of [
      'git add backend/tests/".."/x.test.ts',
      "git add 'backend/tests/a.test.ts'",
      'git add backend/tests/a\\.test.ts',
      'git add "backend/tests/a.test.ts"x',
      'git commit -m "x"" -a"',
      'git commit -m "x\\" -a"',
      "git commit -m 'x'",
    ]) {
      assert.equal(getCommandDecision(command).isAllowed, false, command)
    }
  })

  it('accepts several messages and the -- separator', () => {
    assert.equal(
      getCommandDecision('git commit -m "title" -m "body"').isAllowed,
      true,
    )
    assert.equal(
      getCommandDecision('git add -- backend/tests/router.test.ts').isAllowed,
      true,
    )
  })
})

describe('resolveOutPath', () => {
  it('accepts any path outside an agent run', () => {
    assert.equal(
      resolveOutPath('/elsewhere/out', ''),
      resolve('/elsewhere/out'),
    )
  })

  it('confines outputs to the run directory during an agent run', () => {
    assert.equal(
      resolveOutPath(join(RUN_DIR, 'verify', 'a'), RUN_DIR),
      join(RUN_DIR, 'verify', 'a'),
    )
    assert.throws(() => resolveOutPath('/work/repo/backend/src', RUN_DIR))
    assert.throws(() => resolveOutPath(RUN_DIR, RUN_DIR))
  })
})

describe('allow-test-writes hook', () => {
  const runHook = (input) =>
    spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' })

  const getDecisionOf = (event) => {
    const result = runHook(JSON.stringify({ cwd: CHECKOUT, ...event }))

    assert.equal(result.status, 0)

    return result.stdout
      ? JSON.parse(result.stdout).hookSpecificOutput.permissionDecision
      : 'allow'
  }

  it('denies a write to a source file and allows a test file', () => {
    assert.equal(
      getDecisionOf({
        tool_name: 'Edit',
        tool_input: { file_path: 'backend/src/factory.ts' },
      }),
      'deny',
    )
    assert.equal(
      getDecisionOf({
        tool_name: 'Write',
        tool_input: { file_path: 'backend/tests/health.test.ts' },
      }),
      'allow',
    )
  })

  it('denies a shell command with redirection', () => {
    assert.equal(
      getDecisionOf({
        tool_name: 'Bash',
        tool_input: { command: 'git diff > backend/src/x.ts' },
      }),
      'deny',
    )
  })

  it('fails closed on unreadable input', () => {
    const result = runHook('not json')

    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      'deny',
    )
  })
})
