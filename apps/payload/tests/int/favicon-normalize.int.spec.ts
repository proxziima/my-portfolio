// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeIcon } from '@/favicons/normalize'

// The real sharp, wrapped in a spy so tests can tell whether any bytes reached it.
vi.mock('sharp', async (importOriginal) => {
  const actual = (await importOriginal<{ default: (...args: unknown[]) => unknown }>()).default
  return { default: vi.fn((...args: unknown[]) => actual(...args)) }
})
const sharpCalls = vi.mocked(sharp)
beforeEach(() => sharpCalls.mockClear())

const BUDGET = 3000
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0])
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const svg = (body: string, size = 'width="16" height="16"') => Buffer.from(`<svg ${NS} ${size}>${body}</svg>`)
const RED_SVG = svg('<rect width="16" height="16" fill="red"/>')
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: '#f00' }, limitInputPixels: false })
const RED_PNG = await solid(16, 16).png().toBuffer()
const RED_JPEG = await solid(32, 16).jpeg().toBuffer()
/** Enough filtered shapes to take well over a few milliseconds to draw, within every structural limit. */
const SLOW_SVG = svg(
  `<filter id="b"><feGaussianBlur stdDeviation="3"/></filter>${'<rect width="16" height="16" fill="red" filter="url(#b)"/>'.repeat(300)}`,
)
/** `levels` groups that each draw the previous one three times: 3^levels copies of a rect from 3·levels `<use>`s. */
const fanOut = (levels: number, use = 'use') => {
  let defs = '<g id="l0"><rect width="16" height="16" fill="red"/></g>'
  for (let i = 1; i <= levels; i++) defs += `<g id="l${i}">${`<${use} href="#l${i - 1}"/>`.repeat(3)}</g>`
  return svg(`<defs>${defs}</defs><${use} href="#l${levels}"/>`)
}
const image = (href: string) => `<image width="16" height="16" href="${href}"/>`

/** How many pixels of a PNG are not fully transparent. */
async function opaquePixels(png: Buffer): Promise<number> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++
  return count
}

/** Asserts a freshly encoded 64×64 PNG and returns its bytes. */
async function expectPng(found: Awaited<ReturnType<typeof normalizeIcon>>): Promise<Buffer> {
  expect(found).toMatchObject({ mimetype: 'image/png', ext: 'png' })
  expect(found!.data.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
  expect(await sharp(found!.data).metadata()).toMatchObject({ format: 'png', width: 64, height: 64 })
  return found!.data
}

describe('normalizeIcon', () => {
  it('keeps an ICO file as it is', async () => {
    expect(await normalizeIcon(ICO, BUDGET)).toEqual({ data: ICO, mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('rejects gzip-compressed bytes before anything parses them', async () => {
    const started = Date.now()
    expect(await normalizeIcon(gzipSync(RED_SVG), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('draws an SVG as a 64×64 PNG', async () => {
    const png = await expectPng(await normalizeIcon(RED_SVG, BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 64)
  })
  it('keeps the aspect ratio of a non-square SVG, padding with transparency', async () => {
    const png = await expectPng(await normalizeIcon(svg('<rect width="32" height="16" fill="red"/>', 'width="32" height="16"'), BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 32)
  })
  it('draws an SVG declared at a large size (2048×2048)', async () => {
    const big = svg('<rect width="2048" height="2048" fill="red"/>', 'width="2048" height="2048"')
    expect(await opaquePixels(await expectPng(await normalizeIcon(big, BUDGET)))).toBe(64 * 64)
  })
  it('draws an SVG declared without a size', async () => {
    await expectPng(await normalizeIcon(svg('<rect width="100" height="100" fill="red"/>', 'viewBox="0 0 100 100"'), BUDGET))
  })
  it('draws an SVG that starts with a comment', async () => {
    const png = await expectPng(await normalizeIcon(Buffer.from(`<!-- logo -->\n${RED_SVG}`), BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 64)
  })
  it('draws an SVG that starts with a DOCTYPE', async () => {
    const doctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
    const png = await expectPng(await normalizeIcon(Buffer.from(`${doctype}\n${RED_SVG}`), BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 64)
  })

  it('re-encodes a PNG as a 64×64 PNG', async () => {
    const png = await expectPng(await normalizeIcon(RED_PNG, BUDGET))
    expect(png.equals(RED_PNG)).toBe(false)
  })
  it('re-encodes a JPEG as a 64×64 PNG', async () => {
    const png = await expectPng(await normalizeIcon(RED_JPEG, BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 32)
  })

  it('rejects bytes that are not an image', async () => {
    expect(await normalizeIcon(Buffer.from('<!doctype html><html><body>hi</body></html>'), BUDGET)).toBeNull()
    expect(await normalizeIcon(Buffer.from('not an image at all'), BUDGET)).toBeNull()
  })
  it('rejects a malformed SVG', async () => {
    expect(await normalizeIcon(Buffer.from(`<svg ${NS}><rect`), BUDGET)).toBeNull()
  })
  it('rejects a UTF-16 SVG, whose markup the pre-check cannot read', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(RED_SVG.toString(), 'utf16le')])
    expect(await normalizeIcon(utf16, BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('rejects an SVG whose encoding the pre-check cannot read', async () => {
    expect(await normalizeIcon(Buffer.from(`<?xml version="1.0" encoding="UTF-7"?>${RED_SVG}`), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('rejects an SVG that exceeds the pixel cap even at the lowest density', async () => {
    // At 1 dpi this still draws ~13889 px square, beyond the 4096² cap.
    expect(await normalizeIcon(svg('<rect width="1" height="1"/>', 'width="1000000" height="1000000"'), BUDGET)).toBeNull()
  })

  it('rejects a <use> fan-out before drawing it', async () => {
    const started = Date.now()
    expect(await normalizeIcon(fanOut(16), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
    expect(Date.now() - started).toBeLessThan(100)
  })
  it('rejects a <use> fan-out written with a namespace prefix', async () => {
    const prefixed = Buffer.from(fanOut(16, 's:use').toString().replace('<svg ', '<svg xmlns:s="http://www.w3.org/2000/svg" '))
    expect(await normalizeIcon(prefixed, BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('draws a few <use> references', async () => {
    await expectPng(await normalizeIcon(fanOut(2), BUDGET))
  })
  it('rejects an SVG with more than 5000 elements', async () => {
    expect(await normalizeIcon(svg('<rect width="1" height="1"/>'.repeat(5001)), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('rejects an SVG that declares entities', async () => {
    const entity = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "x">]>${RED_SVG}`
    expect(await normalizeIcon(Buffer.from(entity), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('rejects an SVG that uses XInclude', async () => {
    const included = Buffer.from(`<rect xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>`).toString('base64')
    const doc = Buffer.from(
      `<svg ${NS} xmlns:xi="http://www.w3.org/2001/XInclude" width="16" height="16"><xi:include href="data:application/xml;base64,${included}"/></svg>`,
    )
    expect(await normalizeIcon(doc, BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it.each([
    ['an SVG', 'data:image/svg+xml;base64,'],
    ['an SVG with no type', 'data:;base64,'],
    ['an SVG behind character references', '&#100;ata:image/svg+xml;base64,'],
    ['an SVG behind a tab in the scheme', 'd&#9;ata:image/svg+xml;base64,'],
  ])('rejects an inline image that is %s', async (_, prefix) => {
    const nested = gzipSync(RED_SVG).toString('base64')
    expect(await normalizeIcon(svg(image(`${prefix}${nested}`)), BUDGET)).toBeNull()
    expect(sharpCalls).not.toHaveBeenCalled()
  })
  it('rejects a stylesheet loaded from a data: URL', async () => {
    const doc = svg(`<style>@import url("data:text/css,rect{fill:red}");</style><rect width="16" height="16"/>`)
    expect(await normalizeIcon(doc, BUDGET)).toBeNull()
  })
  it('rejects inline raster images beyond the pixel cap', async () => {
    const huge = (await solid(4100, 4100).png().toBuffer()).toString('base64')
    expect(await normalizeIcon(svg(image(`data:image/png;base64,${huge}`)), BUDGET)).toBeNull()
  })

  it('draws an inline data: PNG', async () => {
    const png = await expectPng(await normalizeIcon(svg(image(`data:image/png;base64,${RED_PNG.toString('base64')}`)), BUDGET))
    expect(await opaquePixels(png)).toBe(64 * 64)
  })
  describe('external references', () => {
    let dir: string
    let file: string
    let requests = 0
    let server: http.Server
    let base: string
    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'favicon-'))
      file = path.join(dir, 'red.png')
      await writeFile(file, RED_PNG)
      server = http.createServer((_req, res) => {
        requests++
        res.writeHead(200, { 'content-type': 'image/png' }).end(RED_PNG)
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })
    afterAll(async () => {
      server.close()
      await rm(dir, { recursive: true, force: true })
    })

    it.each([
      ['a file: URL', () => pathToFileURL(file).href],
      ['an absolute path', () => pathToFileURL(file).pathname],
      ['a relative path', () => path.relative(process.cwd(), file).split(path.sep).join('/')],
      ['an http URL', () => `${base}/a.png`],
    ])('never loads an image from %s', async (_, href) => {
      const png = await expectPng(await normalizeIcon(svg(image(href())), BUDGET))
      expect(await opaquePixels(png)).toBe(0)
      expect(requests).toBe(0)
    })
    it('never loads stylesheets or xlink:href images over http', async () => {
      const doc = svg(
        `<style>@import url("${base}/s.css");</style><image width="16" height="16" xlink:href="${base}/b.png"/>`,
      )
      expect(await opaquePixels(await expectPng(await normalizeIcon(doc, BUDGET)))).toBe(0)
      expect(requests).toBe(0)
    })
  })

  it('gives up when the render budget runs out', async () => {
    expect(await normalizeIcon(SLOW_SVG, BUDGET)).not.toBeNull()
    const started = Date.now()
    expect(await normalizeIcon(SLOW_SVG, 1)).toBeNull()
    expect(Date.now() - started).toBeLessThan(100)
  })
})
