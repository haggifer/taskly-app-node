import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getChangedLineCoverage,
  getFileSummary,
  getTotalSummary,
} from '../lib/coverage.mjs'

const coverageMap = {
  '/home/runner/work/repo/repo/backend/src/factory.ts': {
    statementMap: {
      0: { start: { line: 10 }, end: { line: 10 } },
      1: { start: { line: 11 }, end: { line: 13 } },
      2: { start: { line: 12 }, end: { line: 12 } },
      3: { start: { line: 20 }, end: { line: 20 } },
    },
    s: { 0: 3, 1: 0, 2: 1, 3: 0 },
  },
}

const pct = (value) => ({ total: 10, covered: value / 10, pct: value })

const summaryMap = {
  total: {
    lines: pct(50),
    branches: pct(40),
    functions: pct(30),
    statements: pct(45),
  },
  'C:\\repo\\frontend\\src\\lib\\http.ts': {
    lines: pct(100),
    branches: pct(90),
    functions: pct(100),
    statements: pct(100),
  },
}

describe('getChangedLineCoverage', () => {
  it('counts only executable changed lines and lists the uncovered ones', () => {
    assert.deepEqual(
      getChangedLineCoverage(
        coverageMap,
        'backend/src/factory.ts',
        [9, 10, 11, 12, 20],
      ),
      {
        changed: 4,
        covered: 2,
        uncoveredLines: [11, 20],
      },
    )
  })

  it('returns null for a file missing from the report', () => {
    assert.equal(
      getChangedLineCoverage(coverageMap, 'backend/src/other.ts', [1]),
      null,
    )
  })

  it('does not match a file that only shares a suffix', () => {
    assert.equal(
      getChangedLineCoverage(coverageMap, 'src/factory.ts', [10]).changed,
      1,
    )
    assert.equal(getChangedLineCoverage(coverageMap, 'actory.ts', [10]), null)
  })
})

describe('coverage summaries', () => {
  it('reads totals and per-file percentages, including Windows paths', () => {
    assert.deepEqual(getTotalSummary(summaryMap), {
      lines: 50,
      branches: 40,
      functions: 30,
      statements: 45,
    })
    assert.deepEqual(getFileSummary(summaryMap, 'frontend/src/lib/http.ts'), {
      lines: 100,
      branches: 90,
      functions: 100,
      statements: 100,
    })
    assert.equal(
      getFileSummary(summaryMap, 'frontend/src/lib/missing.ts'),
      null,
    )
  })
})
