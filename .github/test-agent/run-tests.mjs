import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readOptions,
  requireOption,
  runCli,
  splitList,
  writeJson,
} from './lib/cli.mjs'
import {
  getChangedLineCoverage,
  getFileSummary,
  getTotalSummary,
} from './lib/coverage.mjs'
import {
  classifyPath,
  isAllowedTestPath,
  isSafeRepoPath,
  toAppRelativePath,
} from './lib/paths.mjs'
import { findFlakyTests, summarizeResults } from './lib/results.mjs'
import {
  REPO_ROOT,
  runPrettierCheck,
  runTypecheck,
  runVitest,
} from './lib/tools.mjs'

const APPS = ['backend', 'frontend']
const MAX_REPEAT = 5

const OPTIONS = {
  app: { type: 'string' },
  tests: { type: 'string' },
  targets: { type: 'string' },
  changes: { type: 'string' },
  repeat: { type: 'string', default: '1' },
  typecheck: { type: 'boolean', default: false },
  out: { type: 'string' },
}

const toRepoPath = (app, path) =>
  path.startsWith(`${app}/`) ? path : `${app}/${path}`

const getTestFiles = (app, value) =>
  splitList(value).map((path) => {
    const repoPath = toRepoPath(app, path)

    if (!isAllowedTestPath(repoPath))
      throw new Error(`Not a test file of ${app}: ${path}`)

    return repoPath
  })

const getTargets = (app, value) =>
  splitList(value).map((path) => {
    const repoPath = toRepoPath(app, path)

    if (!isSafeRepoPath(repoPath) || classifyPath(repoPath).app !== app) {
      throw new Error(`Not a source file of ${app}: ${path}`)
    }

    return repoPath
  })

const getRepeat = (value) => {
  const repeat = Number(value)

  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) {
    throw new Error(`--repeat must be an integer from 1 to ${MAX_REPEAT}`)
  }

  return repeat
}

const readChangedSources = (path, app) =>
  path
    ? JSON.parse(readFileSync(path, 'utf8')).files.filter(
        (file) =>
          file.app === app &&
          file.kind === 'source' &&
          file.status !== 'deleted',
      )
    : []

const getCoverage = (run, targets) => {
  if (!run.coverageSummary) return null

  return {
    total: getTotalSummary(run.coverageSummary),
    files: Object.fromEntries(
      targets.map((path) => [path, getFileSummary(run.coverageSummary, path)]),
    ),
  }
}

const getChangedLinesCoverage = (run, changedSources) =>
  run.coverageMap
    ? Object.fromEntries(
        changedSources.map((file) => [
          file.path,
          getChangedLineCoverage(run.coverageMap, file.path, file.changedLines),
        ]),
      )
    : {}

const getExitFailures = (runs, summaries) =>
  runs
    .filter(
      (run, index) =>
        run.exitCode !== 0 && summaries[index].failures.length === 0,
    )
    .map((run) => ({
      file: null,
      name: 'vitest',
      message: `Vitest exited with code ${run.exitCode} although every test passed (coverage threshold or configuration error).\n${run.output}`,
    }))

const dedupeFailures = (failures) => [
  ...new Map(
    failures.map((failure) => [`${failure.file} › ${failure.name}`, failure]),
  ).values(),
]

const formatCheck = (name, check) =>
  check
    ? [
        check.exitCode === 0
          ? `${name}: ok`
          : `${name}: FAILED\n${check.output}`,
      ]
    : []

const isCheckPassing = (check) => (check?.exitCode ?? 0) === 0

const formatSummary = (result) => {
  const lines = [
    `${result.app}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${result.runs} run(s))`,
    ...result.failures.map(
      (failure) =>
        `FAIL ${failure.file ? `${failure.file} › ` : ''}${failure.name}\n${failure.message}`,
    ),
    ...result.flaky.map((key) => `FLAKY ${key}`),
    ...formatCheck('typecheck', result.typecheck),
    ...formatCheck('prettier', result.format),
  ]

  if (result.coverage) {
    lines.push(`coverage (lines): total ${result.coverage.total.lines}%`)

    for (const [path, summary] of Object.entries(result.coverage.files)) {
      lines.push(
        `  ${path}: ${summary ? `${summary.lines}% lines, ${summary.branches}% branches` : 'not in report'}`,
      )
    }
  }

  for (const [path, coverage] of Object.entries(result.changedLineCoverage)) {
    lines.push(
      coverage
        ? `changed lines ${path}: ${coverage.covered}/${coverage.changed} covered${coverage.uncoveredLines.length ? `, uncovered ${coverage.uncoveredLines.join(',')}` : ''}`
        : `changed lines ${path}: not in coverage report`,
    )
  }

  return lines.join('\n')
}

runCli(() => {
  const values = readOptions(OPTIONS)
  const app = requireOption(values, 'app')

  if (!APPS.includes(app))
    throw new Error(`--app must be one of ${APPS.join(', ')}`)

  const testFiles = getTestFiles(app, values.tests)
  const targets = getTargets(app, values.targets)
  const repeat = getRepeat(values.repeat)
  const out = requireOption(values, 'out')
  const changedSources = readChangedSources(values.changes, app)

  const appTestFiles = testFiles.map(toAppRelativePath)
  const coverageInclude = targets.map(toAppRelativePath)

  const firstRun = runVitest({
    app,
    testFiles: appTestFiles,
    outDir: join(out, 'run-1'),
    isCoverageEnabled: true,
    coverageInclude,
  })
  const repeatRuns = Array.from({ length: repeat - 1 }, (_, index) =>
    runVitest({
      app,
      testFiles: appTestFiles,
      outDir: join(out, `run-${index + 2}`),
      isShuffled: true,
    }),
  )
  const runs = [firstRun, ...repeatRuns]
  const typecheck = values.typecheck ? runTypecheck(app) : null
  const format =
    values.typecheck && app === 'frontend'
      ? runPrettierCheck(appTestFiles)
      : null

  const summaries = runs.map((run) => summarizeResults(REPO_ROOT, run.results))
  const failures = dedupeFailures([
    ...summaries.flatMap((summary) => summary.failures),
    ...(testFiles.length === 0 ? getExitFailures(runs, summaries) : []),
  ])
  const result = {
    app,
    tests: testFiles,
    runs: runs.length,
    passed: summaries[0].passed,
    failed: failures.length,
    skipped: summaries[0].skipped,
    failures,
    flaky: findFlakyTests(
      REPO_ROOT,
      runs.map((run) => run.results),
    ),
    coverage: getCoverage(firstRun, targets),
    changedLineCoverage: getChangedLinesCoverage(firstRun, changedSources),
    typecheck,
    format,
    vitestOutput: failures.length ? firstRun.output : '',
  }
  const isPassing =
    result.failed === 0 &&
    result.flaky.length === 0 &&
    isCheckPassing(typecheck) &&
    isCheckPassing(format)

  writeJson(join(out, 'result.json'), result)
  console.log(formatSummary(result))

  return isPassing ? 0 : 1
})
