import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { runCli } from './lib/cli.mjs'
import {
  classifyPath,
  isAllowedTestPath,
  toAppRelativePath,
} from './lib/paths.mjs'
import { REPO_ROOT } from './lib/tools.mjs'

const PRETTIER = 'node_modules/prettier/bin/prettier.cjs'

const toFrontendTestPath = (path) => {
  const repoPath = path.startsWith('frontend/') ? path : `frontend/${path}`

  if (
    !isAllowedTestPath(repoPath) ||
    classifyPath(repoPath).app !== 'frontend'
  ) {
    throw new Error(`Not a front-end test file: ${path}`)
  }

  return toAppRelativePath(repoPath)
}

runCli(() => {
  const files = process.argv.slice(2).map(toFrontendTestPath)

  if (files.length === 0)
    throw new Error('Pass the front-end test files to format.')

  const result = spawnSync(
    process.execPath,
    [PRETTIER, '--write', '--', ...files],
    {
      cwd: join(REPO_ROOT, 'frontend'),
      encoding: 'utf8',
    },
  )

  process.stdout.write(`${result.stdout ?? ''}${result.stderr ?? ''}`)

  return result.status ?? 1
})
