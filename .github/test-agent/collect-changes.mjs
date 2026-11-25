import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertRevision,
  readOptions,
  requireOption,
  runCli,
  writeJson,
} from './lib/cli.mjs'
import { getChangedFiles, getChangedLines } from './lib/git.mjs'
import { classifyPath, getTestFilePath, isSafeRepoPath } from './lib/paths.mjs'
import { REPO_ROOT } from './lib/tools.mjs'

const OPTIONS = {
  base: { type: 'string' },
  head: { type: 'string', default: 'HEAD' },
  out: { type: 'string' },
}

const describeUnsafePath = (change) => ({
  ...change,
  app: 'other',
  kind: 'other',
  reason: 'unsupported path',
  changedLines: [],
  testFile: null,
  testFileExists: false,
})

const describeChange = (base, head, change) => {
  if (!isSafeRepoPath(change.path)) return describeUnsafePath(change)

  const { app, kind, reason } = classifyPath(change.path)
  const testFile = getTestFilePath(change.path)
  const isLineDiffNeeded = kind === 'source' && change.status !== 'deleted'

  return {
    ...change,
    app,
    kind,
    reason,
    changedLines: isLineDiffNeeded
      ? getChangedLines(base, head, change.path, REPO_ROOT)
      : [],
    testFile,
    testFileExists: testFile ? existsSync(join(REPO_ROOT, testFile)) : false,
  }
}

const countByKind = (files) =>
  Object.fromEntries(
    ['source', 'test', 'excluded', 'other'].map((kind) => [
      kind,
      files.filter((file) => file.kind === kind).length,
    ]),
  )

const formatLine = (file) => {
  const test = file.testFile
    ? ` → ${file.testFile}${file.testFileExists ? '' : ' (missing)'}`
    : ''
  const reason = file.reason ? ` (${file.reason})` : ''

  return `${file.kind.padEnd(8)} ${file.status.padEnd(8)} ${file.path}${reason}${test}`
}

runCli(() => {
  const values = readOptions(OPTIONS)
  const base = assertRevision(requireOption(values, 'base'), 'base')
  const head = assertRevision(values.head, 'head')
  const out = requireOption(values, 'out')

  const files = getChangedFiles(base, head, REPO_ROOT).map((change) =>
    describeChange(base, head, change),
  )
  const summary = countByKind(files)

  writeJson(out, { base, head, files, summary })
  console.log(files.map(formatLine).join('\n') || 'No changed files.')
  console.log(`\n${JSON.stringify(summary)}`)
})
