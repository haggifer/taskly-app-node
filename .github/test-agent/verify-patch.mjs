import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertRevision,
  readOptions,
  requireOption,
  runCli,
  writeJson,
} from './lib/cli.mjs'
import { getChangedLineCoverage, getTotalSummary } from './lib/coverage.mjs'
import { getWorkingTreeAddedText, getWorkingTreeChanges } from './lib/git.mjs'
import { checkPatch } from './lib/patch.mjs'
import { classifyPath, toAppRelativePath } from './lib/paths.mjs'
import { renderSummary } from './lib/report.mjs'
import { summarizeResults } from './lib/results.mjs'
import {
  REPO_ROOT,
  runPrettierCheck,
  runTypecheck,
  runVitest,
} from './lib/tools.mjs'

const APPS = ['backend', 'frontend']

const OPTIONS = {
  since: { type: 'string' },
  changes: { type: 'string' },
  baseline: { type: 'string' },
  out: { type: 'string' },
}

const readJsonIfPresent = (path) =>
  path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null

const readBaselineCoverage = (baselineDir, app, file) =>
  baselineDir
    ? readJsonIfPresent(join(baselineDir, app, 'run-1', 'coverage', file))
    : null

const getAddedText = (since, change) => {
  if (change.status === 'deleted') return []

  return change.isUntracked
    ? readFileSync(join(REPO_ROOT, change.path), 'utf8').split('\n')
    : getWorkingTreeAddedText(since, change.path, REPO_ROOT)
}

const getStatus = (changes, isPassing) => {
  if (changes.length === 0) return 'no-changes'

  return isPassing ? 'passed' : 'failed'
}

const getTotalBytes = (changes) =>
  changes
    .filter(({ path }) => existsSync(join(REPO_ROOT, path)))
    .reduce((sum, { path }) => sum + statSync(join(REPO_ROOT, path)).size, 0)

const getChangedFrontendFiles = (changes) =>
  changes
    .filter(
      ({ path, status }) =>
        status !== 'deleted' && classifyPath(path).app === 'frontend',
    )
    .map(({ path }) => toAppRelativePath(path))

const verifyApp = (app, changes, outDir, baselineDir) => {
  const typecheck = runTypecheck(app)
  const run = runVitest({
    app,
    outDir: join(outDir, app),
    isCoverageEnabled: true,
  })
  const tests = summarizeResults(REPO_ROOT, run.results)
  const thresholdFailure =
    run.exitCode !== 0 && tests.failures.length === 0
      ? [
          {
            file: null,
            name: 'vitest',
            message: `Vitest exited with code ${run.exitCode}: coverage thresholds or configuration.\n${run.output}`,
          },
        ]
      : []
  const baselineSummary = readBaselineCoverage(
    baselineDir,
    app,
    'coverage-summary.json',
  )

  return {
    typecheck,
    format:
      app === 'frontend'
        ? runPrettierCheck(getChangedFrontendFiles(changes))
        : null,
    tests: {
      ...tests,
      failed: tests.failed + thresholdFailure.length,
      failures: [...tests.failures, ...thresholdFailure],
    },
    coverage: run.coverageSummary ? getTotalSummary(run.coverageSummary) : null,
    baselineCoverage: baselineSummary ? getTotalSummary(baselineSummary) : null,
    coverageMap: run.coverageMap,
  }
}

const isAppPassing = (result) =>
  result.typecheck.exitCode === 0 &&
  result.tests.failed === 0 &&
  (result.format?.exitCode ?? 0) === 0

const getPrChangedLineCoverage = (manifest, apps, baselineDir) =>
  Object.fromEntries(
    (manifest?.files ?? [])
      .filter(
        (file) =>
          file.kind === 'source' &&
          file.status !== 'deleted' &&
          file.changedLines.length,
      )
      .map((file) => {
        const before = readBaselineCoverage(
          baselineDir,
          file.app,
          'coverage-final.json',
        )
        const after = apps[file.app]?.coverageMap

        return [
          file.path,
          {
            before: before
              ? getChangedLineCoverage(before, file.path, file.changedLines)
              : null,
            after: after
              ? getChangedLineCoverage(after, file.path, file.changedLines)
              : null,
          },
        ]
      }),
  )

const withoutCoverageMaps = (apps) =>
  Object.fromEntries(
    Object.entries(apps).map(([name, { coverageMap, ...rest }]) => [
      name,
      rest,
    ]),
  )

runCli(() => {
  const values = readOptions(OPTIONS)
  const since = assertRevision(requireOption(values, 'since'), 'since')
  const out = requireOption(values, 'out')
  const manifest = readJsonIfPresent(values.changes)

  const changes = getWorkingTreeChanges(since, REPO_ROOT)
  const addedTextByPath = Object.fromEntries(
    changes.map((change) => [change.path, getAddedText(since, change)]),
  )
  const totalBytes = getTotalBytes(changes)
  const violations = checkPatch({ changes, addedTextByPath, totalBytes })

  const apps =
    changes.length === 0
      ? {}
      : Object.fromEntries(
          APPS.map((app) => [
            app,
            verifyApp(app, changes, join(out, 'runs'), values.baseline),
          ]),
        )
  const isPassing =
    violations.length === 0 && Object.values(apps).every(isAppPassing)
  const verification = {
    status: getStatus(changes, isPassing),
    since,
    changedFiles: changes.map(({ path, status }) => ({ path, status })),
    totalBytes,
    violations,
    apps: withoutCoverageMaps(apps),
    changedLineCoverage:
      changes.length === 0
        ? {}
        : getPrChangedLineCoverage(manifest, apps, values.baseline),
  }
  const summary = renderSummary(verification)

  writeJson(join(out, 'verification.json'), verification)
  writeFileSync(join(out, 'summary.md'), `${summary}\n`)
  console.log(summary)

  return verification.status === 'failed' ? 1 : 0
})
