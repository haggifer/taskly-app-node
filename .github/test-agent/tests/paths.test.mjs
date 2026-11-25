import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyPath,
  getTestFilePath,
  isAllowedTestPath,
  isSafeRepoPath,
} from '../lib/paths.mjs'

describe('classifyPath', () => {
  const cases = [
    ['README.md', { app: 'other', kind: 'other' }],
    ['backend/package.json', { app: 'backend', kind: 'other' }],
    [
      'backend/src/features/todos/router.ts',
      { app: 'backend', kind: 'source' },
    ],
    ['backend/src/main.ts', { app: 'backend', kind: 'source' }],
    [
      'backend/src/features/todos/types.ts',
      { app: 'backend', kind: 'excluded' },
    ],
    [
      'backend/src/generated/prisma/client.ts',
      { app: 'backend', kind: 'excluded' },
    ],
    ['backend/tests/router.test.ts', { app: 'backend', kind: 'test' }],
    ['backend/tests/fixture.ts', { app: 'backend', kind: 'test' }],
    ['frontend/src/lib/http.ts', { app: 'frontend', kind: 'source' }],
    [
      'frontend/src/features/todos/components/TodoItem.tsx',
      { app: 'frontend', kind: 'source' },
    ],
    [
      'frontend/src/features/todos/components/TodoItem.test.tsx',
      { app: 'frontend', kind: 'test' },
    ],
    ['frontend/src/test/todoFixture.ts', { app: 'frontend', kind: 'test' }],
    [
      'frontend/src/design-system/components/Button/Button.tsx',
      { app: 'frontend', kind: 'excluded' },
    ],
    [
      'frontend/src/features/todos/index.ts',
      { app: 'frontend', kind: 'excluded' },
    ],
    [
      'frontend/src/features/todos/api/queryKeys.ts',
      { app: 'frontend', kind: 'excluded' },
    ],
    ['frontend/src/main.tsx', { app: 'frontend', kind: 'excluded' }],
    ['frontend/src/styles.css', { app: 'frontend', kind: 'other' }],
    ['frontend/vite.config.ts', { app: 'frontend', kind: 'other' }],
  ]

  for (const [path, expected] of cases) {
    it(`classifies ${path} as ${expected.kind}`, () => {
      const { app, kind } = classifyPath(path)

      assert.deepEqual({ app, kind }, expected)
    })
  }

  it('explains why a file is excluded', () => {
    assert.equal(
      classifyPath('frontend/src/design-system/index.ts').reason,
      'design system',
    )
  })
})

describe('getTestFilePath', () => {
  it('maps back-end sources to the flat tests folder', () => {
    assert.equal(
      getTestFilePath('backend/src/core/config.ts'),
      'backend/tests/config.test.ts',
    )
    assert.equal(
      getTestFilePath('backend/src/features/todos/router.ts'),
      'backend/tests/router.test.ts',
    )
  })

  it('maps front-end sources to a co-located test', () => {
    assert.equal(
      getTestFilePath('frontend/src/lib/http.ts'),
      'frontend/src/lib/http.test.ts',
    )
    assert.equal(
      getTestFilePath('frontend/src/features/todos/TodosPage.tsx'),
      'frontend/src/features/todos/TodosPage.test.tsx',
    )
  })

  it('returns null for files that need no test', () => {
    assert.equal(getTestFilePath('README.md'), null)
    assert.equal(getTestFilePath('backend/src/features/todos/types.ts'), null)
    assert.equal(getTestFilePath('frontend/src/lib/http.test.ts'), null)
  })
})

describe('isAllowedTestPath', () => {
  it('accepts test files and test support files', () => {
    assert.equal(isAllowedTestPath('backend/tests/health.test.ts'), true)
    assert.equal(isAllowedTestPath('backend/tests/fixture.ts'), true)
    assert.equal(isAllowedTestPath('frontend/src/lib/http.test.ts'), true)
    assert.equal(isAllowedTestPath('frontend/src/test/todoFixture.ts'), true)
  })

  it('rejects source, config, package and workflow files', () => {
    assert.equal(isAllowedTestPath('backend/src/factory.ts'), false)
    assert.equal(isAllowedTestPath('backend/package.json'), false)
    assert.equal(isAllowedTestPath('backend/vitest.config.ts'), false)
    assert.equal(isAllowedTestPath('frontend/src/lib/http.ts'), false)
    assert.equal(isAllowedTestPath('.github/workflows/ci.yml'), false)
  })

  it('rejects traversal and unusual paths', () => {
    assert.equal(isAllowedTestPath('backend/tests/../src/factory.ts'), false)
    assert.equal(isAllowedTestPath('/backend/tests/a.test.ts'), false)
    assert.equal(isAllowedTestPath('backend\\tests\\a.test.ts'), false)
    assert.equal(isSafeRepoPath(''), false)
  })
})
