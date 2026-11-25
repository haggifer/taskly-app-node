import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readOptions, requireOption, runCli, writeJson } from './lib/cli.mjs'
import { selectTargets } from './lib/targets.mjs'
import { REPO_ROOT } from './lib/tools.mjs'

const APPS = ['backend', 'frontend']
const MAX_FILES_LIMIT = 12

const OPTIONS = {
  baseline: { type: 'string' },
  app: { type: 'string' },
  max: { type: 'string', default: '8' },
  threshold: { type: 'string', default: '90' },
  out: { type: 'string' },
}

const getBoundedInteger = (value, name, min, max) => {
  const number = Number(value)

  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`--${name} must be an integer from ${min} to ${max}`)
  }

  return number
}

runCli(() => {
  const values = readOptions(OPTIONS)
  const app = requireOption(values, 'app')

  if (!APPS.includes(app))
    throw new Error(`--app must be one of ${APPS.join(', ')}`)

  const summaryPath = join(
    requireOption(values, 'baseline'),
    app,
    'run-1',
    'coverage',
    'coverage-summary.json',
  )
  const maxFiles = getBoundedInteger(values.max, 'max', 1, MAX_FILES_LIMIT)
  const threshold = getBoundedInteger(values.threshold, 'threshold', 1, 100)
  const out = requireOption(values, 'out')

  const summaryMap = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const targets = selectTargets({
    repoRoot: REPO_ROOT,
    app,
    summaryMap,
    threshold,
    maxFiles,
  }).map((target) => ({
    ...target,
    testFileExists: existsSync(join(REPO_ROOT, target.testFile)),
  }))

  writeJson(out, { app, threshold, targets })
  console.log(
    targets
      .map(
        (target) =>
          `${String(target.lines).padStart(6)}% lines ${String(target.branches).padStart(6)}% branches  ${target.path} → ${target.testFile}${target.testFileExists ? '' : ' (missing)'}`,
      )
      .join('\n') || 'Every source file meets the threshold.',
  )
})
