import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

/** Marks the CI comment so later runs update it instead of adding another. */
export const MARKER = '<!-- ci-report -->'

interface Metric {
  pct: number | 'Unknown'
}
export interface CoverageSummary {
  total: { lines: Metric; statements: Metric; functions: Metric; branches: Metric }
}
export interface PackageCoverage {
  /** Package directory relative to the repo root, e.g. `apps/web`. */
  pkg: string
  summary: CoverageSummary
}

const pct = (metric: Metric) => (typeof metric.pct === 'number' ? `${metric.pct.toFixed(1)}%` : '–')

/** The PR comment: what was checked, the verify result and coverage per package. */
export function renderReport(input: {
  all: boolean
  affected: readonly string[]
  verify: string
  runUrl: string
  coverage: readonly PackageCoverage[]
}): string {
  const scope = input.all
    ? 'everything (repo-wide change)'
    : input.affected.length > 0
      ? input.affected.map((name) => `\`${name}\``).join(', ')
      : 'nothing'
  const lines = [
    MARKER,
    '### CI report',
    '',
    `**Checked:** ${scope}`,
    '',
    `**verify:** ${input.verify}`,
    '',
  ]
  if (input.coverage.length === 0) {
    lines.push(
      input.verify === 'success'
        ? 'No coverage: no tests ran for this change.'
        : `No coverage was uploaded (verify: ${input.verify}).`,
    )
  } else {
    lines.push(
      '| Package | Lines | Statements | Functions | Branches |',
      '| --- | ---: | ---: | ---: | ---: |',
    )
    for (const { pkg, summary } of [...input.coverage].sort((a, b) => a.pkg.localeCompare(b.pkg))) {
      const { lines: l, statements, functions, branches } = summary.total
      lines.push(
        `| \`${pkg}\` | ${pct(l)} | ${pct(statements)} | ${pct(functions)} | ${pct(branches)} |`,
      )
    }
  }
  lines.push('', `[Run details](${input.runUrl})`, '')
  return lines.join('\n')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Every `<pkg>/coverage/coverage-summary.json` under `dir` (the downloaded artifact). */
export function readCoverage(dir: string): PackageCoverage[] {
  if (!existsSync(dir)) return []
  return walk(dir)
    .filter(
      (path) =>
        basename(path) === 'coverage-summary.json' && basename(dirname(path)) === 'coverage',
    )
    .map((path) => ({
      pkg: relative(dir, dirname(dirname(path)))
        .split(sep)
        .join('/'),
      summary: JSON.parse(readFileSync(path, 'utf8')) as CoverageSummary,
    }))
}

/** CI entry (the `report` job): prints the comment body. */
if (import.meta.main) {
  process.stdout.write(
    renderReport({
      all: process.env.ALL === 'true',
      affected: JSON.parse(process.env.AFFECTED || '[]') as string[],
      verify: process.env.VERIFY ?? 'unknown',
      runUrl: process.env.RUN_URL ?? '',
      coverage: readCoverage(process.argv[2] ?? 'coverage-artifact'),
    }),
  )
}
