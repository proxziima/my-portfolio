import { describe, expect, it } from 'bun:test'
import { collect, decide, IMAGES, toOutputs } from './affected'

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
    const result = pr(['//', '@repo/cms-types'], ['packages/cms-types/src/index.ts'])
    expect(result.workspaces).toEqual({ web: false, cms: false, agents: false, twin: false })
    expect(result.images).toEqual([])
  })

  it('does not treat workspace-level package.json or scripts as repo-wide', () => {
    const result = pr(['web', 'agents'], ['apps/web/package.json', 'apps/agents/scripts/x.ts'])
    expect(result.all).toBe(false)
    expect(result.workspaces).toEqual({ web: true, cms: false, agents: true, twin: false })
  })
})

describe('collect', () => {
  /** A fake `run` that records every argv and answers turbo and git from canned output. */
  const fake = (turbo: unknown, git = '') => {
    const calls: string[][] = []
    const run = (cmd: string[]) => {
      calls.push(cmd)
      return cmd[0] === 'git' ? git : JSON.stringify(turbo)
    }
    return { calls, run }
  }
  const affectedPackages = (...names: string[]) => ({
    data: { affectedPackages: { items: names.map((name) => ({ name })) } },
  })

  it('runs no commands outside a pull request', () => {
    const { calls, run } = fake(affectedPackages())
    expect(collect({ GITHUB_EVENT_NAME: 'push' }, run)).toEqual({
      event: 'push',
      packages: [],
      files: [],
    })
    expect(collect({}, run).event).toBe('workflow_dispatch')
    expect(calls).toEqual([])
  })

  it('refuses a pull request without a base instead of checking nothing', () => {
    const { calls, run } = fake(affectedPackages())
    expect(() => collect({ GITHUB_EVENT_NAME: 'pull_request' }, run)).toThrow(
      'GITHUB_BASE_REF is not set on a pull_request run',
    )
    expect(calls).toEqual([])
  })

  it('asks turbo and git about the base and maps the results', () => {
    const { calls, run } = fake(
      affectedPackages('web', '@repo/twin'),
      'apps/web/old.ts\0apps/web/new.ts\0docs/café.md\0',
    )
    const result = collect({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'develop' }, run)
    expect(calls).toEqual([
      ['bunx', 'turbo', 'query', 'affected', '--packages', '--base', 'origin/develop'],
      ['git', 'diff', '--name-only', '--no-renames', '-z', 'origin/develop...HEAD'],
    ])
    expect(result).toEqual({
      event: 'pull_request',
      packages: ['web', '@repo/twin'],
      files: ['apps/web/old.ts', 'apps/web/new.ts', 'docs/café.md'],
    })
  })

  it('throws the turbo message when the query reports errors', () => {
    const { run } = fake({ data: null, errors: [{ message: 'Could not resolve base' }] })
    expect(() =>
      collect({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'nope' }, run),
    ).toThrow('Could not resolve base')
  })

  it('throws when the query has no affected packages', () => {
    const { run } = fake({ data: {} })
    expect(() =>
      collect({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'develop' }, run),
    ).toThrow('turbo query returned no affectedPackages')
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
