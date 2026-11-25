import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseAddedLines,
  parseAddedText,
  parseNameStatus,
} from '../lib/git.mjs'

describe('parseNameStatus', () => {
  it('reads added, modified, deleted and renamed files', () => {
    const output = [
      'A\tfrontend/src/lib/new.ts',
      'M\tbackend/src/factory.ts',
      'D\tbackend/src/old.ts',
      'R087\tbackend/src/a.ts\tbackend/src/b.ts',
      '',
    ].join('\n')

    assert.deepEqual(parseNameStatus(output), [
      { path: 'frontend/src/lib/new.ts', previousPath: null, status: 'added' },
      {
        path: 'backend/src/factory.ts',
        previousPath: null,
        status: 'modified',
      },
      { path: 'backend/src/old.ts', previousPath: null, status: 'deleted' },
      {
        path: 'backend/src/b.ts',
        previousPath: 'backend/src/a.ts',
        status: 'renamed',
      },
    ])
  })

  it('returns nothing for an empty diff', () => {
    assert.deepEqual(parseNameStatus(''), [])
  })
})

describe('parseAddedLines', () => {
  it('expands hunk ranges on the new side', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '@@ -3,0 +4,2 @@ function a() {',
      '+one',
      '+two',
      '@@ -10 +12 @@',
      '-old',
      '+new',
      '@@ -20,3 +21,0 @@',
    ].join('\n')

    assert.deepEqual(parseAddedLines(diff), [4, 5, 12])
  })
})

describe('parseAddedText', () => {
  it('keeps added lines and drops file headers', () => {
    const diff = [
      '+++ b/x.test.ts',
      '@@ -0,0 +1,2 @@',
      "+it.only('a', () => {})",
      '-removed',
      '+next',
    ].join('\n')

    assert.deepEqual(parseAddedText(diff), ["it.only('a', () => {})", 'next'])
  })
})
