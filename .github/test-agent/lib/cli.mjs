import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const GIT_REVISION = /^(?!-)[\w./~^-]{1,100}$/

// Inside an agent run, outputs may only go to the run directory, so these scripts can't be used to write elsewhere.
export const resolveOutPath = (
  path,
  runDir = process.env.TEST_AGENT_RUN_DIR,
) => {
  const absolutePath = resolve(path)

  if (!runDir) return absolutePath

  const fromRunDir = relative(resolve(runDir), absolutePath)

  if (
    fromRunDir === '' ||
    fromRunDir.startsWith('..') ||
    isAbsolute(fromRunDir)
  ) {
    throw new Error(`--out must be inside the run directory ${runDir}`)
  }

  return absolutePath
}

export const readOptions = (options) =>
  parseArgs({ options, strict: true }).values

export const requireOption = (values, name) => {
  if (!values[name]) throw new Error(`Missing required option --${name}`)

  return values[name]
}

export const assertRevision = (value, name) => {
  if (!GIT_REVISION.test(value))
    throw new Error(`Invalid git revision for --${name}: ${value}`)

  return value
}

export const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const writeJson = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

export const runCli = (main) => {
  try {
    process.exitCode = main() ?? 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
