import { describe, expect, it } from 'bun:test'
import { decide, IMAGES, toOutputs } from './affected'

const pr = (packages: string[], files: string[]) =>
  decide({ event: 'pull_request', packages, files })

describe('decide', () => {
  it('checks everything on a push, a manual run or a schedule', () => {
    for (const event of ['push', 'workflow_dispatch', 'schedule']) {
      const result = decide({ event, packages: [], files: [] })
      expect(result.all).toBe(true)
      expect(result.workspaces).toEqual({ web: true, cms: true, agents: true, twin: true })
      expect(result.images).toEqual([...IMAGES])
    }
  })

  it('checks only the workspaces turbo reports for a pull request', () => {
    const result = pr(['web'], ['apps/web/app/page.tsx'])
    expect(result.all).toBe(false)
    expect(result.workspaces).toEqual({ web: true, cms: false, agents: false, twin: false })
    expect(result.images).toEqual([{ service: 'web', dockerfile: 'apps/web/Dockerfile' }])
  })

  it('follows dependents: a twin change reaches agents, cms and web', () => {
    const result = pr(['@repo/twin', 'agents', 'cms', 'web'], ['packages/twin/src/env.ts'])
    expect(result.workspaces).toEqual({ web: true, cms: true, agents: true, twin: true })
    expect(result.images.map((i) => i.service)).toEqual(['web', 'cms', 'agents'])
  })

  it('treats lockfile, root config, compose, CI and root scripts as repo-wide', () => {
    for (const file of [
      'bun.lock',
      'package.json',
      'turbo.json',
      '.npmrc',
      'docker-compose.yml',
      'docker-compose.build.yml',
      '.dockerignore',
      '.github/workflows/ci.yml',
      'scripts/scan-client-bundle.ts',
    ]) {
      expect(pr([], [file]).all).toBe(true)
    }
  })

  it('checks nothing for a docs-only pull request', () => {
    const result = pr([], ['docs/ci-cd.md', 'README.md'])
    expect(result.all).toBe(false)
    expect(result.workspaces).toEqual({ web: false, cms: false, agents: false, twin: false })
    expect(result.images).toEqual([])
  })

  it('ignores packages that are not gated workspaces', () => {
    expect(pr(['//', '@repo/cms-types'], ['packages/cms-types/src/index.ts']).workspaces.web).toBe(
      false,
    )
  })
})

describe('toOutputs', () => {
  it('writes one GITHUB_OUTPUT line per key, with JSON for lists', () => {
    const out = toOutputs(pr(['cms'], ['apps/payload/src/payload.config.ts']))
    expect(out).toBe(
      [
        'all=false',
        'web=false',
        'cms=true',
        'agents=false',
        'twin=false',
        'images=[{"service":"cms","dockerfile":"apps/payload/Dockerfile"}]',
        'affected=["cms"]',
        '',
      ].join('\n'),
    )
  })
})
