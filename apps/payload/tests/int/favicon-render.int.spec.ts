// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInChild } from '@/favicons/render'

/**
 * The real spawn, wrapped so tests can read what the render process was started with, swap its
 * program (`program`), or stop the CMS side from killing it (`parentKills = false`).
 */
const control = vi.hoisted(() => ({ program: null as string | null, output: '', parentKills: true }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const real = actual.spawn as (...args: unknown[]) => ChildProcess
  return {
    ...actual,
    spawn: vi.fn((command: unknown, args: string[], options: unknown) => {
      // Same flags, another `-e` program.
      const swapped = control.program ? args.map((arg, i) => (args[i - 1] === '-e' ? control.program : arg)) : args
      const child = real(command, swapped, options)
      if (control.program) child.stdout!.on('data', (chunk: Buffer) => (control.output += chunk.toString()))
      if (!control.parentKills) child.kill = () => true
      return child
    }),
  }
})
const spawned = vi.mocked(spawn)
beforeEach(() => {
  spawned.mockClear()
  control.program = null
  control.output = ''
  control.parentKills = true
})

const NS = 'xmlns="http://www.w3.org/2000/svg"'
const svg = (body: string) => Buffer.from(`<svg ${NS} width="64" height="64">${body}</svg>`)
const RED_SVG = svg('<rect width="64" height="64" fill="red"/>')
/** `levels` elements of `tag` that each draw the previous one `width` times through `attr`. */
function chain(tag: string, attr: string, width: number, levels: number): Buffer {
  let defs = `<${tag} id="x0"><rect width="64" height="64" fill="white"/></${tag}>`
  for (let i = 1; i <= levels; i++) {
    defs += `<${tag} id="x${i}">${`<rect width="64" height="64" fill="white" ${attr}="url(#x${i - 1})"/>`.repeat(width)}</${tag}>`
  }
  return svg(`${defs}<rect width="64" height="64" fill="red" ${attr}="url(#x${levels})"/>`)
}

const lastChild = () => spawned.mock.results.at(-1)!.value as ChildProcess
const childEnv = () => (spawned.mock.calls.at(-1)![2] as { env: Record<string, string> }).env

describe('renderInChild', () => {
  it('draws an SVG as a PNG', async () => {
    const png = await renderInChild(RED_SVG, 'svg', { timeoutMs: 10_000, memoryMb: 256 })
    expect(png?.subarray(0, 4).toString('latin1')).toBe('\x89PNG')
  })

  it('dies at its memory cap long before the time cap, even on input the pre-check would refuse', async () => {
    // A clipPath chain grows the render process to most of a gigabyte when left alone.
    const started = Date.now()
    expect(await renderInChild(chain('clipPath', 'clip-path', 10, 12), 'svg', { timeoutMs: 10_000, memoryMb: 256 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(1500)
    expect(lastChild().exitCode).not.toBe(0)
  })

  it('kills itself after its own time cap when nobody else does', async () => {
    control.parentKills = false
    const started = Date.now()
    // A mask chain keeps drawing for tens of seconds within the memory cap.
    expect(await renderInChild(chain('mask', 'mask', 10, 8), 'svg', { timeoutMs: 200, memoryMb: 4096 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(3000)
  }, 10_000)

  it('refuses output that is not a PNG, even on a clean exit', async () => {
    control.program = "process.stdout.write('<svg onload=alert(1)>', () => process.exit(0))"
    expect(await renderInChild(RED_SVG, 'svg', { timeoutMs: 10_000, memoryMb: 256 })).toBeNull()
    expect(lastChild().exitCode).toBe(0)
  })

  it.runIf(process.allowedNodeEnvironmentFlags.has('--permission'))(
    'runs the render process unable to read outside its modules, write files or start processes',
    async () => {
      control.program = String.raw`
        const attempt = (name, fn) => { try { fn(); return name + ':allowed' } catch (e) { return name + ':' + e.code } }
        const fs = require('node:fs')
        process.stdout.write([
          attempt('read', () => fs.readFileSync(require('node:path').join(process.cwd(), 'package.json'))),
          attempt('write', () => fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'favicon-perm-probe'), 'x')),
          attempt('spawn', () => require('node:child_process').execSync('whoami')),
        ].join(' '), () => process.exit(0))`
      await renderInChild(RED_SVG, 'svg', { timeoutMs: 10_000, memoryMb: 256 })
      expect(control.output).toBe('read:ERR_ACCESS_DENIED write:ERR_ACCESS_DENIED spawn:ERR_ACCESS_DENIED')
    },
  )

  describe('environment', () => {
    const secret = process.env.PAYLOAD_SECRET
    afterEach(() => {
      if (secret === undefined) Reflect.deleteProperty(process.env, 'PAYLOAD_SECRET')
      else process.env.PAYLOAD_SECRET = secret
    })
    it('passes the render process only what it needs, no secrets', async () => {
      process.env.PAYLOAD_SECRET = 'do-not-leak'
      expect(await renderInChild(RED_SVG, 'svg', { timeoutMs: 10_000, memoryMb: 256 })).not.toBeNull()
      const env = childEnv()
      expect(Object.values(env)).not.toContain('do-not-leak')
      const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'FAVICON_JOB']
      expect(Object.keys(env).filter((key) => !allowed.includes(key))).toEqual([])
    })
  })

  describe('runtime', () => {
    afterEach(() => {
      delete (process.versions as Partial<Record<string, string>>).bun
    })
    it('fails closed under Bun, whose executable is not node', async () => {
      Object.defineProperty(process.versions, 'bun', { value: '1.3.10', configurable: true, enumerable: true })
      expect(await renderInChild(RED_SVG, 'svg', { timeoutMs: 10_000, memoryMb: 256 })).toBeNull()
      expect(spawned).not.toHaveBeenCalled()
    })
  })
})
