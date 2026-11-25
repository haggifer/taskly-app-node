import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { getWriteDecision } from '../lib/write-guard.mjs'

const REPO_ROOT = resolve('/work/repo')
const RUN_DIR = resolve('/tmp/test-agent')
const HOOK = join(import.meta.dirname, '..', 'hooks', 'allow-test-writes.mjs')

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

  it('allows the run directory', () => {
    assert.equal(decide(join(RUN_DIR, 'report.md')).isAllowed, true)
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
    assert.equal(decide(RUN_DIR).isAllowed, false)
  })

  it('refuses a call without a path', () => {
    assert.equal(decide(undefined).isAllowed, false)
  })
})

describe('allow-test-writes hook', () => {
  const runHook = (input) =>
    spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' })

  it('prints a deny decision for a source file', () => {
    const result = runHook(
      JSON.stringify({
        tool_name: 'Edit',
        cwd: resolve(import.meta.dirname, '../../..'),
        tool_input: { file_path: 'backend/src/factory.ts' },
      }),
    )

    assert.equal(result.status, 0)
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      'deny',
    )
  })

  it('stays silent for a test file', () => {
    const result = runHook(
      JSON.stringify({
        tool_name: 'Write',
        cwd: resolve(import.meta.dirname, '../../..'),
        tool_input: { file_path: 'backend/tests/health.test.ts' },
      }),
    )

    assert.equal(result.status, 0)
    assert.equal(result.stdout, '')
  })

  it('fails closed on unreadable input', () => {
    const result = runHook('not json')

    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      'deny',
    )
  })
})
