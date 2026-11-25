import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

const GIT_REVISION = /^(?!-)[\w./~^-]{1,100}$/

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
