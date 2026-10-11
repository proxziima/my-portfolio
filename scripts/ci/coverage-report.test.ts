import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARKER, readCoverage, renderReport, type CoverageSummary } from './coverage-report'

const summary = (lines: number | 'Unknown', branches = 50): CoverageSummary => ({
  total: {
    lines: { pct: lines },
    statements: { pct: 80 },
    functions: { pct: 70 },
    branches: { pct: branches },
  },
})

describe('renderReport', () => {
  it('starts with the marker and lists packages sorted, one row each', () => {
    const body = renderReport({
      all: false,
      affected: ['web', 'cms'],
      verify: 'success',
      runUrl: 'https://example.test/run/1',
      coverage: [
        { pkg: 'apps/web', summary: summary(91.234) },
        { pkg: 'apps/payload', summary: summary(40) },
      ],
    })
    expect(body.startsWith(`${MARKER}\n`)).toBe(true)
    expect(body).toContain('**Checked:** `web`, `cms`')
    expect(body).toContain('**verify:** success')
    expect(body.indexOf('`apps/payload`')).toBeLessThan(body.indexOf('`apps/web`'))
    expect(body).toContain('| `apps/web` | 91.2% | 80.0% | 70.0% | 50.0% |')
    expect(body).toContain('[Run details](https://example.test/run/1)')
  })

  it('says everything was checked on a repo-wide change', () => {
    const body = renderReport({
      all: true,
      affected: [],
      verify: 'success',
      runUrl: '',
      coverage: [],
    })
    expect(body).toContain('**Checked:** everything (repo-wide change)')
  })

  it('says when no tests ran', () => {
    const body = renderReport({
      all: false,
      affected: [],
      verify: 'success',
      runUrl: '',
      coverage: [],
    })
    expect(body).toContain('**Checked:** nothing')
    expect(body).toContain('No coverage: no tests ran for this change.')
  })

  it('does not claim no tests ran when verify did not succeed and nothing was uploaded', () => {
    const body = renderReport({
      all: true,
      affected: [],
      verify: 'failure',
      runUrl: '',
      coverage: [],
    })
    expect(body).toContain('No coverage was uploaded (verify: failure).')
    expect(body).not.toContain('no tests ran')
  })

  it('shows an unmeasured metric as a dash', () => {
    const body = renderReport({
      all: false,
      affected: ['twin'],
      verify: 'failure',
      runUrl: '',
      coverage: [{ pkg: 'packages/twin', summary: summary('Unknown') }],
    })
    expect(body).toContain('| `packages/twin` | – | 80.0% | 70.0% | 50.0% |')
  })
})

describe('readCoverage', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('finds every coverage/coverage-summary.json and names it by its package path', () => {
    dir = mkdtempSync(join(tmpdir(), 'cov-'))
    for (const pkg of ['apps/web', 'packages/twin']) {
      mkdirSync(join(dir, pkg, 'coverage'), { recursive: true })
      writeFileSync(
        join(dir, pkg, 'coverage', 'coverage-summary.json'),
        JSON.stringify(summary(10)),
      )
    }
    writeFileSync(join(dir, 'stray.json'), '{}')
    expect(
      readCoverage(dir)
        .map((c) => c.pkg)
        .sort(),
    ).toEqual(['apps/web', 'packages/twin'])
  })

  it('returns nothing for a missing directory', () => {
    dir = join(tmpdir(), 'does-not-exist-cov')
    expect(readCoverage(dir)).toEqual([])
  })
})
