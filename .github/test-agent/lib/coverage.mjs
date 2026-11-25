const normalizeSlashes = (path) => path.replaceAll('\\', '/')

const findEntry = (map, repoPath) => {
  const suffix = `/${repoPath}`
  const key = Object.keys(map).find((candidate) =>
    normalizeSlashes(candidate).endsWith(suffix),
  )

  return key ? map[key] : null
}

const getLineHits = (fileCoverage) => {
  const hits = new Map()

  for (const [id, location] of Object.entries(fileCoverage.statementMap)) {
    const line = location.start.line

    hits.set(line, Math.max(hits.get(line) ?? 0, fileCoverage.s[id] ?? 0))
  }

  return hits
}

export const getChangedLineCoverage = (coverageMap, repoPath, changedLines) => {
  const fileCoverage = findEntry(coverageMap, repoPath)

  if (!fileCoverage) return null

  const hits = getLineHits(fileCoverage)
  const executable = changedLines.filter((line) => hits.has(line))
  const uncoveredLines = executable.filter((line) => hits.get(line) === 0)

  return {
    changed: executable.length,
    covered: executable.length - uncoveredLines.length,
    uncoveredLines,
  }
}

const toPercentages = (entry) => ({
  lines: entry.lines.pct,
  branches: entry.branches.pct,
  functions: entry.functions.pct,
  statements: entry.statements.pct,
})

export const getFileSummary = (summaryMap, repoPath) => {
  const entry = findEntry(summaryMap, repoPath)

  return entry ? toPercentages(entry) : null
}

export const getTotalSummary = (summaryMap) => toPercentages(summaryMap.total)
