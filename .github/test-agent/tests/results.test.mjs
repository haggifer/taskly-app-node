import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findFlakyTests, summarizeResults } from '../lib/results.mjs'

const REPO_ROOT = '/repo'

const assertion = (fullName, status, failureMessages = []) => ({
  fullName,
  status,
  failureMessages,
})

const results = (testResults, counts = {}) => ({
  numTotalTests: 2,
  numPassedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults,
  ...counts,
})

describe('summarizeResults', () => {
  it('lists failed assertions with repo-relative files', () => {
    const summary = summarizeResults(
      REPO_ROOT,
      results([
        {
          name: '/repo/backend/tests/a.test.ts',
          status: 'failed',
          assertionResults: [
            assertion('a passes', 'passed'),
            assertion('a fails', 'failed', ['expected 1 to be 2']),
          ],
        },
      ]),
    )

    assert.equal(summary.passed, 1)
    assert.equal(summary.failed, 1)
    assert.deepEqual(summary.failures[0], {
      file: 'backend/tests/a.test.ts',
      name: 'a fails',
      message: 'expected 1 to be 2',
    })
  })

  it('reports a test file that failed to load', () => {
    const summary = summarizeResults(
      REPO_ROOT,
      results(
        [
          {
            name: '/repo/frontend/src/x.test.ts',
            status: 'failed',
            message: 'Cannot find module',
            assertionResults: [],
          },
        ],
        {
          numTotalTests: 0,
          numPassedTests: 0,
        },
      ),
    )

    assert.equal(summary.failures[0].name, '(test file failed to load)')
  })

  it('treats a run without tests or results as a failure', () => {
    assert.equal(summarizeResults(REPO_ROOT, null).failed, 1)
    assert.equal(
      summarizeResults(
        REPO_ROOT,
        results([], { numTotalTests: 0, numPassedTests: 0 }),
      ).failed,
      1,
    )
  })
})

describe('findFlakyTests', () => {
  it('flags tests whose status differs between runs', () => {
    const file = '/repo/backend/tests/a.test.ts'
    const runOne = results([
      {
        name: file,
        status: 'passed',
        assertionResults: [
          assertion('stable', 'passed'),
          assertion('flaky', 'passed'),
        ],
      },
    ])
    const runTwo = results([
      {
        name: file,
        status: 'failed',
        assertionResults: [
          assertion('stable', 'passed'),
          assertion('flaky', 'failed'),
        ],
      },
    ])

    assert.deepEqual(findFlakyTests(REPO_ROOT, [runOne, runTwo, null]), [
      'backend/tests/a.test.ts › flaky',
    ])
  })
})
