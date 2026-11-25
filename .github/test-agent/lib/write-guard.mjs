import { existsSync, realpathSync } from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { isAllowedTestPath } from './paths.mjs'

const RUN_DIR_FILES = ['report.md']
const RUN_DIR_FOLDERS = ['verify']
const SHELL_OPERATORS = /[;&|<>`$\r\n]/
const OUTPUT_FLAG = /(^|\s)--output(=|\s|$)/

const isInside = (parent, child) => {
  const path = relative(parent, child)

  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

// Symlinks are resolved on the deepest existing ancestor, so a link can't point a test path at a source file.
const getRealPath = (absolutePath) => {
  const missing = []
  let current = absolutePath

  while (!existsSync(current) && dirname(current) !== current) {
    missing.unshift(basename(current))
    current = dirname(current)
  }

  return existsSync(current)
    ? join(realpathSync(current), ...missing)
    : absolutePath
}

const isRunDirTarget = (runDir, path) => {
  if (!isInside(runDir, path)) return false

  const [first, ...rest] = relative(runDir, path).split(sep)

  return (
    (rest.length === 0 && RUN_DIR_FILES.includes(first)) ||
    (rest.length > 0 && RUN_DIR_FOLDERS.includes(first))
  )
}

export const getWriteDecision = ({ filePath, cwd, repoRoot, runDir }) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { isAllowed: false, reason: 'The tool call has no file path.' }
  }

  const realPath = getRealPath(resolve(cwd, filePath))
  const realRepoRoot = getRealPath(resolve(repoRoot))

  if (runDir && isRunDirTarget(getRealPath(resolve(runDir)), realPath)) {
    return { isAllowed: true, reason: null }
  }

  const repoPath = relative(realRepoRoot, realPath).split(sep).join('/')

  if (isInside(realRepoRoot, realPath) && isAllowedTestPath(repoPath)) {
    return { isAllowed: true, reason: null }
  }

  return {
    isAllowed: false,
    reason: `${filePath} is not a test file. The unit-test agent may only write backend/tests/**, frontend/src/**/*.test.ts(x), frontend/src/test/**, and report.md or verify/** in its run directory.`,
  }
}

export const getCommandDecision = (command) => {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return { isAllowed: false, reason: 'The command is empty.' }
  }

  if (SHELL_OPERATORS.test(command)) {
    return {
      isAllowed: false,
      reason:
        'Shell operators, redirection and substitution are not allowed. Run one allowlisted command at a time.',
    }
  }

  if (OUTPUT_FLAG.test(command)) {
    return {
      isAllowed: false,
      reason: '--output is not allowed: write files with the Write tool.',
    }
  }

  return { isAllowed: true, reason: null }
}
