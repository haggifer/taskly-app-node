import { isAllowedTestPath } from './paths.mjs'

export const PATCH_LIMITS = { maxFiles: 30, maxBytes: 300 * 1024 }

const FOCUS_OR_SKIP =
  /\b(?:it|test|describe)\s*\.\s*(?:only|skip)\s*\(|\bf(?:it|describe)\s*\(|\bx(?:it|describe)\s*\(/

const getScopeViolations = (changes) =>
  changes
    .filter(({ path, previousPath }) =>
      [path, previousPath].some(
        (candidate) => candidate && !isAllowedTestPath(candidate),
      ),
    )
    .map(({ path }) => `${path}: only test files may be changed`)

const getDeletionViolations = (changes) =>
  changes
    .filter(({ status }) => status === 'deleted')
    .map(({ path }) => `${path}: existing tests must not be deleted`)

const getContentViolations = (addedTextByPath) =>
  Object.entries(addedTextByPath).flatMap(([path, lines]) =>
    lines
      .filter((line) => FOCUS_OR_SKIP.test(line))
      .map(
        (line) =>
          `${path}: focused or skipped test added: ${line.trim().slice(0, 120)}`,
      ),
  )

const getLimitViolations = (changes, totalBytes) => [
  ...(changes.length > PATCH_LIMITS.maxFiles
    ? [`${changes.length} files changed, limit is ${PATCH_LIMITS.maxFiles}`]
    : []),
  ...(totalBytes > PATCH_LIMITS.maxBytes
    ? [`${totalBytes} bytes changed, limit is ${PATCH_LIMITS.maxBytes}`]
    : []),
]

export const checkPatch = ({ changes, addedTextByPath, totalBytes }) => [
  ...getScopeViolations(changes),
  ...getDeletionViolations(changes),
  ...getContentViolations(addedTextByPath),
  ...getLimitViolations(changes, totalBytes),
]
