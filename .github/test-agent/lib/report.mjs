const MAX_LISTED_FAILURES = 10

const STATUS_LINES = {
  passed:
    '✅ **Passed.** Every check below ran on the tree the agent produced.',
  failed: '❌ **Failed.** Nothing from this run is published.',
  'no-changes':
    '➖ **No changes from the agent.** Nothing to verify or publish.',
}

export const toCode = (text) =>
  `\`${String(text).replaceAll('`', "'").replaceAll('|', '\\|').replaceAll('\n', ' ')}\``

const toFence = (text) =>
  `\`\`\`text\n${String(text).replaceAll('```', "'''")}\n\`\`\``

const formatCheck = (check) => {
  if (!check) return '—'

  return check.exitCode === 0 ? '✅' : '❌'
}

const formatTests = (tests) => {
  if (!tests) return '—'

  const icon = tests.failed === 0 ? '✅' : '❌'
  const failed = tests.failed ? `, ${tests.failed} failed` : ''

  return `${icon} ${tests.passed} passed${failed}`
}

const formatPercent = (value) =>
  typeof value === 'number' ? `${value.toFixed(1)}%` : '—'

const formatTotal = (app) =>
  app?.coverage
    ? `${formatPercent(app.baselineCoverage?.lines)} → ${formatPercent(app.coverage.lines)}`
    : '—'

const formatRatio = (coverage) =>
  coverage ? `${coverage.covered}/${coverage.changed}` : '—'

const renderChecks = ({ backend, frontend }) => [
  '| Check | Backend | Frontend |',
  '|---|---|---|',
  `| Unit tests (full suite) | ${formatTests(backend?.tests)} | ${formatTests(frontend?.tests)} |`,
  `| Typecheck | ${formatCheck(backend?.typecheck)} | ${formatCheck(frontend?.typecheck)} |`,
  `| Prettier (changed tests) | — | ${formatCheck(frontend?.format)} |`,
  `| Line coverage, all files | ${formatTotal(backend)} | ${formatTotal(frontend)} |`,
]

const renderScope = (verification) => {
  if (verification.violations.length === 0) {
    return [
      `**Patch scope:** ✅ ${verification.changedFiles.length} test file(s), ${(verification.totalBytes / 1024).toFixed(1)} KB.`,
    ]
  }

  return [
    '**Patch scope:** ❌',
    ...verification.violations.map((violation) => `- ${toCode(violation)}`),
  ]
}

const renderChangedLines = (changedLineCoverage) => {
  const rows = Object.entries(changedLineCoverage)

  if (rows.length === 0) return []

  return [
    '**Coverage of the lines this PR changed** (executable lines)',
    '',
    '| File | Before | After | Still uncovered |',
    '|---|---|---|---|',
    ...rows.map(
      ([path, { before, after }]) =>
        `| ${toCode(path)} | ${formatRatio(before)} | ${formatRatio(after)} | ${after?.uncoveredLines.length ? after.uncoveredLines.join(', ') : '—'} |`,
    ),
  ]
}

const renderFiles = (changedFiles) =>
  changedFiles.length === 0
    ? []
    : [
        '<details><summary>Files changed by the agent</summary>',
        '',
        ...changedFiles.map(
          ({ path, status }) => `- ${toCode(path)} (${status})`,
        ),
        '',
        '</details>',
      ]

const renderFailures = (apps) => {
  const failures = Object.values(apps).flatMap(
    (app) => app?.tests?.failures ?? [],
  )
  const checkOutputs = Object.entries(apps).flatMap(([name, app]) =>
    ['typecheck', 'format']
      .filter((check) => app?.[check] && app[check].exitCode !== 0)
      .map((check) => ({
        name: `${name} ${check}`,
        output: app[check].output,
      })),
  )

  if (failures.length === 0 && checkOutputs.length === 0) return []

  return [
    '<details><summary>Failures</summary>',
    '',
    ...failures
      .slice(0, MAX_LISTED_FAILURES)
      .flatMap((failure) => [
        `${toCode(`${failure.file ?? ''} › ${failure.name}`)}`,
        '',
        toFence(failure.message),
        '',
      ]),
    ...checkOutputs.flatMap(({ name, output }) => [
      toCode(name),
      '',
      toFence(output),
      '',
    ]),
    '</details>',
  ]
}

export const renderSummary = (verification) =>
  [
    STATUS_LINES[verification.status],
    '',
    ...(verification.status === 'no-changes'
      ? []
      : [...renderChecks(verification.apps), '']),
    ...renderScope(verification),
    '',
    ...renderChangedLines(verification.changedLineCoverage),
    '',
    ...renderFiles(verification.changedFiles),
    ...renderFailures(verification.apps),
  ].join('\n')
