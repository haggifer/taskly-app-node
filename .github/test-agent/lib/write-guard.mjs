import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isAllowedTestPath } from './paths.mjs'

const isInside = (parent, child) => {
  const path = relative(parent, child)

  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

export const getWriteDecision = ({ filePath, cwd, repoRoot, runDir }) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { isAllowed: false, reason: 'The tool call has no file path.' }
  }

  const absolutePath = resolve(cwd, filePath)

  if (runDir && isInside(resolve(runDir), absolutePath)) {
    return { isAllowed: true, reason: null }
  }

  const repoPath = relative(repoRoot, absolutePath).split(sep).join('/')

  if (isInside(repoRoot, absolutePath) && isAllowedTestPath(repoPath)) {
    return { isAllowed: true, reason: null }
  }

  return {
    isAllowed: false,
    reason: `${filePath} is not a test file. The unit-test agent may only write backend/tests/**, frontend/src/**/*.test.ts(x), frontend/src/test/** and its run directory.`,
  }
}
