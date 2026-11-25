import { execFileSync } from 'node:child_process'

const MAX_BUFFER = 64 * 1024 * 1024
// Pull request code may have run in this checkout, so repository config must not be able to run anything: no
// fsmonitor, hooks, pager or system/global config, and every diff call passes --no-ext-diff --no-textconv.
const SAFE_GIT_OPTIONS = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.pager=cat',
  '--no-pager',
]
const SAFE_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
}

const STATUS_NAMES = {
  A: 'added',
  C: 'added',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  T: 'modified',
}

export const runGit = (args, cwd = process.cwd()) =>
  execFileSync('git', [...SAFE_GIT_OPTIONS, ...args], {
    cwd,
    encoding: 'utf8',
    env: SAFE_GIT_ENV,
    maxBuffer: MAX_BUFFER,
  })

export const parseNameStatus = (output) =>
  output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, first, second] = line.split('\t')
      const status = STATUS_NAMES[code[0]] ?? 'modified'

      return status === 'renamed'
        ? { path: second, previousPath: first, status }
        : { path: first, previousPath: null, status }
    })

export const parseAddedLines = (diffOutput) => {
  const lines = []

  for (const match of diffOutput.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])

    for (let line = start; line < start + count; line += 1) lines.push(line)
  }

  return lines
}

export const parseAddedText = (diffOutput) =>
  diffOutput
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))

export const getChangedFiles = (base, head, cwd) =>
  parseNameStatus(
    runGit(
      [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-status',
        '-M',
        '--no-color',
        `${base}...${head}`,
      ],
      cwd,
    ),
  )

export const getChangedLines = (base, head, path, cwd) =>
  parseAddedLines(
    runGit(
      [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '-U0',
        '--no-color',
        `${base}...${head}`,
        '--',
        path,
      ],
      cwd,
    ),
  )

export const getWorkingTreeChanges = (since, cwd) => {
  const tracked = parseNameStatus(
    runGit(
      [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-status',
        '-M',
        '--no-color',
        since,
      ],
      cwd,
    ),
  ).map((change) => ({ ...change, isUntracked: false }))
  const untracked = runGit(['ls-files', '--others', '--exclude-standard'], cwd)
    .split('\n')
    .filter(Boolean)
    .map((path) => ({
      path,
      previousPath: null,
      status: 'added',
      isUntracked: true,
    }))

  return [...tracked, ...untracked]
}

export const getWorkingTreeAddedText = (since, path, cwd) =>
  parseAddedText(
    runGit(
      [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '-U0',
        '--no-color',
        since,
        '--',
        path,
      ],
      cwd,
    ),
  )
