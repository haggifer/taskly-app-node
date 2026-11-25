import { relative } from 'node:path'
import { classifyPath, getTestFilePath } from './paths.mjs'

const toRepoPath = (repoRoot, path) =>
  relative(repoRoot, path).replaceAll('\\', '/')

export const selectTargets = ({
  repoRoot,
  app,
  summaryMap,
  threshold,
  maxFiles,
}) =>
  Object.entries(summaryMap)
    .filter(([key]) => key !== 'total')
    .map(([key, entry]) => ({
      path: toRepoPath(repoRoot, key),
      lines: entry.lines.pct,
      branches: entry.branches.pct,
      functions: entry.functions.pct,
    }))
    .filter(({ path }) => {
      const { app: pathApp, kind } = classifyPath(path)

      return pathApp === app && kind === 'source'
    })
    .filter(({ lines, branches }) => lines < threshold || branches < threshold)
    .sort(
      (a, b) =>
        a.lines - b.lines ||
        a.branches - b.branches ||
        a.path.localeCompare(b.path),
    )
    .slice(0, maxFiles)
    .map((target) => ({ ...target, testFile: getTestFilePath(target.path) }))
