import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MAX_BUFFER = 64 * 1024 * 1024
const OUTPUT_TAIL = 4000

const BINARIES = {
  prettier: 'node_modules/prettier/bin/prettier.cjs',
  tsc: 'node_modules/typescript/bin/tsc',
  vitest: 'node_modules/vitest/vitest.mjs',
}

// The CI gate runs a copy of this toolkit taken before the agent's patch is applied, so the root can be overridden.
export const REPO_ROOT = resolve(
  process.env.TEST_AGENT_REPO_ROOT ?? resolve(import.meta.dirname, '../../..'),
)

const getAppDir = (app) => join(REPO_ROOT, app)

const runNodeBinary = (app, binary, args) => {
  const result = spawnSync(
    process.execPath,
    [join(getAppDir(app), BINARIES[binary]), ...args],
    { cwd: getAppDir(app), encoding: 'utf8', maxBuffer: MAX_BUFFER },
  )
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  return { exitCode: result.status ?? 1, output: output.slice(-OUTPUT_TAIL) }
}

const readJson = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null

const getCoverageArgs = (coverageDir, coverageInclude) => [
  '--coverage.enabled=true',
  '--coverage.reporter=json',
  '--coverage.reporter=json-summary',
  `--coverage.reportsDirectory=${coverageDir}`,
  ...coverageInclude.map((path) => `--coverage.include=${path}`),
]

export const runVitest = ({
  app,
  testFiles = [],
  outDir,
  isCoverageEnabled = false,
  coverageInclude = [],
  isShuffled = false,
}) => {
  // Vitest runs inside the app folder, so a relative path would point somewhere else for it.
  const absoluteOutDir = resolve(outDir)
  const resultsPath = join(absoluteOutDir, 'results.json')
  const coverageDir = join(absoluteOutDir, 'coverage')

  mkdirSync(absoluteOutDir, { recursive: true })

  const { exitCode, output } = runNodeBinary(app, 'vitest', [
    'run',
    ...testFiles,
    '--reporter=json',
    `--outputFile=${resultsPath}`,
    ...(isShuffled ? ['--sequence.shuffle'] : []),
    ...(isCoverageEnabled ? getCoverageArgs(coverageDir, coverageInclude) : []),
  ])

  return {
    exitCode,
    output,
    results: readJson(resultsPath),
    coverageMap: readJson(join(coverageDir, 'coverage-final.json')),
    coverageSummary: readJson(join(coverageDir, 'coverage-summary.json')),
  }
}

export const runTypecheck = (app) => runNodeBinary(app, 'tsc', ['--noEmit'])

export const runPrettierCheck = (files) =>
  files.length === 0
    ? { exitCode: 0, output: '' }
    : runNodeBinary('frontend', 'prettier', ['--check', ...files])
