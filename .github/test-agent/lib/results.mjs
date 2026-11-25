import { relative } from 'node:path'

const MESSAGE_LIMIT = 1500

const toRepoPath = (repoRoot, path) =>
  relative(repoRoot, path).replaceAll('\\', '/')

const getTestKey = (file, name) => `${file} › ${name}`

const getFileFailures = (repoRoot, fileResult) => {
  const file = toRepoPath(repoRoot, fileResult.name)
  const failed = fileResult.assertionResults
    .filter((assertion) => assertion.status === 'failed')
    .map((assertion) => ({
      file,
      name: assertion.fullName,
      message: assertion.failureMessages.join('\n').slice(0, MESSAGE_LIMIT),
    }))

  if (fileResult.status === 'failed' && failed.length === 0) {
    return [
      {
        file,
        name: '(test file failed to load)',
        message: (fileResult.message ?? '').slice(0, MESSAGE_LIMIT),
      },
    ]
  }

  return failed
}

export const summarizeResults = (repoRoot, results) => {
  if (!results) {
    return {
      passed: 0,
      failed: 1,
      skipped: 0,
      failures: [
        { file: null, name: 'vitest', message: 'Vitest wrote no results.' },
      ],
    }
  }

  const failures = results.testResults.flatMap((fileResult) =>
    getFileFailures(repoRoot, fileResult),
  )

  if (results.numTotalTests === 0 && failures.length === 0) {
    failures.push({ file: null, name: 'vitest', message: 'No tests ran.' })
  }

  return {
    passed: results.numPassedTests,
    failed: failures.length,
    skipped: results.numPendingTests + (results.numTodoTests ?? 0),
    failures,
  }
}

export const findFlakyTests = (repoRoot, runs) => {
  const statuses = new Map()

  for (const results of runs.filter(Boolean)) {
    for (const fileResult of results.testResults) {
      const file = toRepoPath(repoRoot, fileResult.name)

      for (const assertion of fileResult.assertionResults) {
        const key = getTestKey(file, assertion.fullName)

        statuses.set(
          key,
          new Set([...(statuses.get(key) ?? []), assertion.status]),
        )
      }
    }
  }

  return [...statuses]
    .filter(([, seen]) => seen.has('passed') && seen.has('failed'))
    .map(([key]) => key)
}
