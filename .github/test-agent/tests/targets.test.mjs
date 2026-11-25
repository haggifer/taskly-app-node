import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectTargets } from '../lib/targets.mjs'

const entry = (lines, branches = lines) => ({
  lines: { pct: lines },
  branches: { pct: branches },
  functions: { pct: lines },
  statements: { pct: lines },
})

const summaryMap = {
  total: entry(40),
  '/repo/backend/src/factory.ts': entry(0),
  '/repo/backend/src/core/config.ts': entry(20),
  '/repo/backend/src/features/todos/router.ts': entry(44, 16),
  '/repo/backend/src/features/todos/validators.ts': entry(100),
  '/repo/backend/src/features/todos/mappers.ts': entry(100, 80),
  '/repo/backend/src/features/todos/types.ts': entry(0),
  '/repo/frontend/src/lib/http.ts': entry(0),
}

describe('selectTargets', () => {
  it('picks the least-covered source files of one app, below the threshold', () => {
    const targets = selectTargets({
      repoRoot: '/repo',
      app: 'backend',
      summaryMap,
      threshold: 90,
      maxFiles: 10,
    })

    assert.deepEqual(
      targets.map(({ path }) => path),
      [
        'backend/src/factory.ts',
        'backend/src/core/config.ts',
        'backend/src/features/todos/router.ts',
        'backend/src/features/todos/mappers.ts',
      ],
    )
    assert.equal(targets[0].testFile, 'backend/tests/factory.test.ts')
  })

  it('respects the file budget', () => {
    const targets = selectTargets({
      repoRoot: '/repo',
      app: 'backend',
      summaryMap,
      threshold: 90,
      maxFiles: 2,
    })

    assert.equal(targets.length, 2)
  })

  it('returns nothing when every file meets the threshold', () => {
    const covered = {
      total: entry(100),
      '/repo/backend/src/features/todos/validators.ts': entry(100),
      '/repo/backend/src/features/todos/mappers.ts': entry(95),
    }

    assert.deepEqual(
      selectTargets({
        repoRoot: '/repo',
        app: 'backend',
        summaryMap: covered,
        threshold: 90,
        maxFiles: 10,
      }),
      [],
    )
  })
})
