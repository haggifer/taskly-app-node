import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderSummary, toCode } from '../lib/report.mjs'

const passingApp = {
  typecheck: { exitCode: 0, output: '' },
  format: null,
  tests: { passed: 52, failed: 0, skipped: 0, failures: [] },
  coverage: { lines: 81.25 },
  baselineCoverage: { lines: 33.02 },
}

const verification = {
  status: 'passed',
  changedFiles: [{ path: 'backend/tests/health.test.ts', status: 'added' }],
  totalBytes: 2048,
  violations: [],
  apps: {
    backend: passingApp,
    frontend: { ...passingApp, format: { exitCode: 0, output: '' } },
  },
  changedLineCoverage: {
    'backend/src/api/health.ts': {
      before: { changed: 4, covered: 0, uncoveredLines: [5, 6, 7, 8] },
      after: { changed: 4, covered: 4, uncoveredLines: [] },
    },
  },
}

describe('renderSummary', () => {
  it('shows checks, coverage deltas and changed-line coverage', () => {
    const summary = renderSummary(verification)

    assert.match(summary, /✅ \*\*Passed\.\*\*/)
    assert.match(summary, /\| Unit tests \(full suite\) \| ✅ 52 passed \|/)
    assert.match(summary, /33\.0% → 81\.3%/)
    assert.match(
      summary,
      /\| `backend\/src\/api\/health\.ts` \| 0\/4 \| 4\/4 \| — \|/,
    )
  })

  it('lists violations and failures when verification fails', () => {
    const failingApp = {
      ...passingApp,
      tests: {
        passed: 1,
        failed: 1,
        skipped: 0,
        failures: [
          {
            file: 'backend/tests/a.test.ts',
            name: 'breaks',
            message: 'expected ``` 1',
          },
        ],
      },
    }
    const summary = renderSummary({
      ...verification,
      status: 'failed',
      violations: ['backend/package.json: only test files may be changed'],
      apps: { backend: failingApp, frontend: passingApp },
    })

    assert.match(summary, /❌ \*\*Failed\.\*\*/)
    assert.match(summary, /❌ 1 passed, 1 failed/)
    assert.match(
      summary,
      /`backend\/package\.json: only test files may be changed`/,
    )
    assert.doesNotMatch(summary, /expected ``` 1/)
  })

  it('renders a short note when the agent changed nothing', () => {
    const summary = renderSummary({
      ...verification,
      status: 'no-changes',
      changedFiles: [],
      apps: {},
      changedLineCoverage: {},
    })

    assert.match(summary, /No changes from the agent/)
    assert.doesNotMatch(summary, /\| Check \|/)
  })
})

describe('toCode', () => {
  it('neutralizes backticks, table pipes and new lines from test names', () => {
    assert.equal(toCode('a `b` | c\nd'), "`a 'b' \\| c d`")
  })
})
