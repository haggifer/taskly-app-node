import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkPatch, PATCH_LIMITS } from '../lib/patch.mjs'

const added = (path) => ({ path, previousPath: null, status: 'added' })

describe('checkPatch', () => {
  it('accepts new and updated test files', () => {
    const changes = [
      added('backend/tests/health.test.ts'),
      {
        path: 'frontend/src/lib/http.test.ts',
        previousPath: null,
        status: 'modified',
      },
    ]

    assert.deepEqual(
      checkPatch({ changes, addedTextByPath: {}, totalBytes: 2048 }),
      [],
    )
  })

  it('rejects changes outside the test globs, including prompt-injected targets', () => {
    const changes = [
      added('backend/package.json'),
      added('.github/workflows/ci.yml'),
      added('backend/tests/../src/factory.ts'),
      {
        path: 'backend/src/factory.ts',
        previousPath: null,
        status: 'modified',
      },
    ]

    assert.equal(
      checkPatch({ changes, addedTextByPath: {}, totalBytes: 10 }).length,
      4,
    )
  })

  it('rejects a rename that moves a source file into the tests folder', () => {
    const changes = [
      {
        path: 'backend/tests/factory.ts',
        previousPath: 'backend/src/factory.ts',
        status: 'renamed',
      },
    ]

    assert.match(
      checkPatch({ changes, addedTextByPath: {}, totalBytes: 10 })[0],
      /only test files/,
    )
  })

  it('rejects deleting an existing test', () => {
    const changes = [
      {
        path: 'backend/tests/router.test.ts',
        previousPath: null,
        status: 'deleted',
      },
    ]

    assert.match(
      checkPatch({ changes, addedTextByPath: {}, totalBytes: 0 })[0],
      /must not be deleted/,
    )
  })

  it('rejects focused or skipped tests in added lines', () => {
    const changes = [added('frontend/src/lib/http.test.ts')]
    const addedTextByPath = {
      'frontend/src/lib/http.test.ts': [
        "it.only('focuses', () => {})",
        "describe.skip('skips', () => {})",
        "xit('skips', () => {})",
        "it('runs', () => {})",
        "it.todo('is reported, not rejected')",
      ],
    }

    assert.equal(
      checkPatch({ changes, addedTextByPath, totalBytes: 10 }).length,
      3,
    )
  })

  it('enforces the file and size limits', () => {
    const changes = Array.from(
      { length: PATCH_LIMITS.maxFiles + 1 },
      (_, index) => added(`backend/tests/t${index}.test.ts`),
    )
    const violations = checkPatch({
      changes,
      addedTextByPath: {},
      totalBytes: PATCH_LIMITS.maxBytes + 1,
    })

    assert.equal(violations.length, 2)
  })
})
