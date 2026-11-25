const MAX_PATH_LENGTH = 300

const BACKEND_SOURCE = /^backend\/src\/.+\.ts$/
const BACKEND_TEST = /^backend\/tests\/.+\.ts$/
const FRONTEND_SOURCE = /^frontend\/src\/.+\.tsx?$/
const FRONTEND_TEST = /^frontend\/src\/.+\.test\.tsx?$/
const FRONTEND_TEST_SUPPORT = /^frontend\/src\/test\/.+\.tsx?$/

// Mirrors coverage.exclude in backend/vitest.config.ts and frontend/vite.config.ts.
const BACKEND_EXCLUDED = [
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/\/types\.ts$/, 'type declarations only'],
]
const FRONTEND_EXCLUDED = [
  [/^frontend\/src\/main\.tsx$/, 'application entry point'],
  [/^frontend\/src\/design-system\//, 'design system'],
  [/\.stories\.tsx?$/, 'Storybook story'],
  [/\.d\.ts$/, 'type declarations only'],
  [/\/types\.ts$/, 'type declarations only'],
  [/\.types\.ts$/, 'type declarations only'],
  [/\/index\.ts$/, 're-export barrel'],
  [/\/constants\.tsx?$/, 'constants only'],
  [/\.constants\.ts$/, 'constants only'],
  [
    /^frontend\/src\/features\/todos\/api\/queryKeys\.ts$/,
    'query key constants',
  ],
  [/^frontend\/src\/lib\/queryClient\.ts$/, 'query client configuration'],
]

const getAppOf = (path) => {
  if (path.startsWith('backend/')) return 'backend'
  if (path.startsWith('frontend/')) return 'frontend'
  return 'other'
}

const findExclusion = (rules, path) =>
  rules.find(([pattern]) => pattern.test(path))?.[1] ?? null

const classifyBackend = (path) => {
  if (BACKEND_TEST.test(path)) return { kind: 'test', reason: null }

  if (!BACKEND_SOURCE.test(path)) {
    return { kind: 'other', reason: 'not application source' }
  }

  const exclusion = findExclusion(BACKEND_EXCLUDED, path)

  return exclusion
    ? { kind: 'excluded', reason: exclusion }
    : { kind: 'source', reason: null }
}

const classifyFrontend = (path) => {
  if (FRONTEND_TEST.test(path) || FRONTEND_TEST_SUPPORT.test(path)) {
    return { kind: 'test', reason: null }
  }

  if (!FRONTEND_SOURCE.test(path)) {
    return { kind: 'other', reason: 'not application source' }
  }

  const exclusion = findExclusion(FRONTEND_EXCLUDED, path)

  return exclusion
    ? { kind: 'excluded', reason: exclusion }
    : { kind: 'source', reason: null }
}

export const isSafeRepoPath = (path) =>
  typeof path === 'string' &&
  path.length > 0 &&
  path.length <= MAX_PATH_LENGTH &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.includes('\0') &&
  path.split('/').every((segment) => segment !== '..' && segment !== '.')

export const classifyPath = (path) => {
  const app = getAppOf(path)

  if (app === 'backend') return { app, ...classifyBackend(path) }
  if (app === 'frontend') return { app, ...classifyFrontend(path) }

  return { app, kind: 'other', reason: 'outside the applications' }
}

export const getTestFilePath = (sourcePath) => {
  const { app, kind } = classifyPath(sourcePath)

  if (kind !== 'source') return null

  if (app === 'backend') {
    const name = sourcePath.split('/').at(-1).replace(/\.ts$/, '')

    return `backend/tests/${name}.test.ts`
  }

  return sourcePath.replace(/\.(tsx?)$/, '.test.$1')
}

export const isAllowedTestPath = (path) =>
  isSafeRepoPath(path) &&
  (BACKEND_TEST.test(path) ||
    FRONTEND_TEST.test(path) ||
    FRONTEND_TEST_SUPPORT.test(path))

export const toAppRelativePath = (path) =>
  path.replace(/^(backend|frontend)\//, '')
