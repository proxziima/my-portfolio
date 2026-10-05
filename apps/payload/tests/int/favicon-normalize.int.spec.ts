// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeIcon } from '@/favicons/normalize'

// The real spawn, wrapped in a spy so tests can tell whether a render process was started.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const real = actual.spawn as (...args: unknown[]) => ChildProcess
  return { ...actual, spawn: vi.fn((...args: unknown[]) => real(...args)) }
})
const spawned = vi.mocked(spawn)
beforeEach(() => {
  spawned.mockClear()
})

const CAPS = { timeoutMs: 10_000, memoryMb: 256 }
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const svg = (body: string, size = 'width="16" height="16"') => Buffer.from(`<svg ${NS} ${size}>${body}</svg>`)
const RED_SVG = svg('<rect width="16" height="16" fill="red"/>')
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: '#f00' }, limitInputPixels: false })
const RED_PNG = await solid(16, 16).png().toBuffer()
const RED_JPEG = await solid(32, 16).jpeg().toBuffer()
const image = (href: string) => `<image width="16" height="16" href="${href}"/>`
/** Enough translucent shapes to take a few hundred milliseconds to draw, within every structural limit. */
const SLOW_SVG = svg('<circle cx="8" cy="8" r="8" fill="red" opacity="0.5"/>'.repeat(4900))

/** An ICO file holding the given images, each as one directory entry. */
function ico(...images: Buffer[]): Buffer {
  const header = Buffer.from([0, 0, 1, 0, images.length, 0])
  let offset = 6 + 16 * images.length
  const entries = images.map((img) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(16, 0)
    entry.writeUInt8(16, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(img.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += img.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}
/** A BMP image as an ICO stores it: a 40-byte BITMAPINFOHEADER, then pixels. */
const BMP = Buffer.concat([Buffer.from([40, 0, 0, 0]), Buffer.alloc(36 + 16 * 32 * 4)])

/**
 * `levels` elements of `tag` that each draw the previous one `width` times through `attr`, as in
 * `<mask id="x2"><rect mask="url(#x1)"/>…</mask>`: width^levels copies from a few hundred bytes.
 */
function chain(tag: string, attr: string, width = 10, levels = 12): Buffer {
  let defs = `<${tag} id="x0"><rect width="16" height="16" fill="white"/></${tag}>`
  for (let i = 1; i <= levels; i++) {
    defs += `<${tag} id="x${i}">${`<rect width="16" height="16" fill="white" ${attr}="url(#x${i - 1})"/>`.repeat(width)}</${tag}>`
  }
  return svg(`<defs>${defs}</defs><rect width="16" height="16" fill="red" ${attr}="url(#x${levels})"/>`)
}
/** `levels` groups that each draw the previous one three times: 3^levels copies of a rect. */
function fanOut(levels: number, use = 'use'): Buffer {
  let defs = '<g id="l0"><rect width="16" height="16" fill="red"/></g>'
  for (let i = 1; i <= levels; i++) defs += `<g id="l${i}">${`<${use} href="#l${i - 1}"/>`.repeat(3)}</g>`
  return svg(`<defs>${defs}</defs><${use} href="#l${levels}"/>`)
}

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

/** Asserts the bytes are refused by a check in this process, without starting a render. */
async function expectRefusedUpFront(data: Buffer) {
  expect(await normalizeIcon(data, CAPS)).toBeNull()
  expect(spawned).not.toHaveBeenCalled()
}

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('normalizeIcon: ICO', () => {
  it('keeps an ICO holding a PNG as it is', async () => {
    const file = ico(RED_PNG)
    expect(await normalizeIcon(file, CAPS)).toEqual({ data: file, mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('keeps an ICO holding BMP images as it is', async () => {
    const file = ico(BMP, RED_PNG)
    expect(await normalizeIcon(file, CAPS)).toEqual({ data: file, mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('refuses an SVG behind the four ICO magic bytes', async () => {
    await expectRefusedUpFront(Buffer.concat([Buffer.from([0, 0, 1, 0]), RED_SVG]))
  })
  it('refuses an ICO whose image lies outside the file', async () => {
    const file = ico(RED_PNG)
    file.writeUInt32LE(RED_PNG.length + 1, 6 + 8)
    await expectRefusedUpFront(file)
  })
  it('refuses an ICO whose image is neither a PNG nor a BMP', async () => {
    await expectRefusedUpFront(ico(Buffer.from(RED_SVG)))
  })
})

describe('normalizeIcon: content', () => {
  it('refuses gzip-compressed bytes without parsing them', async () => {
    await expectRefusedUpFront(gzipSync(RED_SVG))
  })
  it('draws an SVG as a 64×64 PNG', async () => {
    expect(await opaquePixels(await expectPng(await normalizeIcon(RED_SVG, CAPS)))).toBe(64 * 64)
  })
  it('draws a typical brand SVG: viewBox only, paths, a clip-path and gradient fills', async () => {
    const brand = svg(
      '<defs><linearGradient id="g"><stop stop-color="#f60"/><stop offset="1" stop-color="#c00"/></linearGradient>' +
        '<clipPath id="c"><rect width="100" height="100" rx="20"/></clipPath></defs>' +
        `<g clip-path="url(#c)">${'<path d="M0 0h100v100H0z" fill="url(#g)"/>'.repeat(30)}</g>`,
      'viewBox="0 0 100 100"',
    )
    expect(await opaquePixels(await expectPng(await normalizeIcon(brand, CAPS)))).toBeGreaterThan(0)
  })
  it('keeps the aspect ratio of a non-square SVG, padding with transparency', async () => {
    const png = await expectPng(await normalizeIcon(svg('<rect width="32" height="16" fill="red"/>', 'width="32" height="16"'), CAPS))
    expect(await opaquePixels(png)).toBe(64 * 32)
  })
  it('draws an SVG declared at a large size (2048×2048)', async () => {
    const big = svg('<rect width="2048" height="2048" fill="red"/>', 'width="2048" height="2048"')
    expect(await opaquePixels(await expectPng(await normalizeIcon(big, CAPS)))).toBe(64 * 64)
  })
  it('draws an SVG declared without a size', async () => {
    await expectPng(await normalizeIcon(svg('<rect width="100" height="100" fill="red"/>', 'viewBox="0 0 100 100"'), CAPS))
  })
  it('draws an SVG that starts with a comment', async () => {
    expect(await opaquePixels(await expectPng(await normalizeIcon(Buffer.from(`<!-- logo -->\n${RED_SVG}`), CAPS)))).toBe(64 * 64)
  })
  it('draws an SVG that starts with a DOCTYPE', async () => {
    const doctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
    expect(await opaquePixels(await expectPng(await normalizeIcon(Buffer.from(`${doctype}\n${RED_SVG}`), CAPS)))).toBe(64 * 64)
  })
  it('draws an inline data: PNG', async () => {
    const png = await expectPng(await normalizeIcon(svg(image(`data:image/png;base64,${RED_PNG.toString('base64')}`)), CAPS))
    expect(await opaquePixels(png)).toBe(64 * 64)
  })
  it('re-encodes a PNG as a 64×64 PNG', async () => {
    expect((await expectPng(await normalizeIcon(RED_PNG, CAPS))).equals(RED_PNG)).toBe(false)
  })
  it('re-encodes a JPEG as a 64×64 PNG', async () => {
    expect(await opaquePixels(await expectPng(await normalizeIcon(RED_JPEG, CAPS)))).toBe(64 * 32)
  })
  it('refuses bytes that are not an image', async () => {
    expect(await normalizeIcon(Buffer.from('<!doctype html><html><body>hi</body></html>'), CAPS)).toBeNull()
    expect(await normalizeIcon(Buffer.from('not an image at all'), CAPS)).toBeNull()
  })
  it('refuses a malformed SVG', async () => {
    expect(await normalizeIcon(Buffer.from(`<svg ${NS}><rect`), CAPS)).toBeNull()
  })
  it('refuses an SVG that exceeds the pixel cap even at the lowest density', async () => {
    // At 1 dpi this still draws ~13889 px square, beyond the 4096² cap.
    expect(await normalizeIcon(svg('<rect width="1" height="1"/>', 'width="1000000" height="1000000"'), CAPS)).toBeNull()
  })
  it('refuses a UTF-16 SVG, whose markup the pre-check cannot read', async () => {
    await expectRefusedUpFront(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(RED_SVG.toString(), 'utf16le')]))
  })
  it('refuses an SVG whose declared encoding the pre-check cannot read', async () => {
    await expectRefusedUpFront(Buffer.from(`<?xml version="1.0" encoding="UTF-7"?>${RED_SVG}`))
  })
})

describe('normalizeIcon: SVG pre-check', () => {
  it('refuses a <use> fan-out', async () => {
    await expectRefusedUpFront(fanOut(16))
  })
  it('refuses a <use> fan-out written with a namespace prefix', async () => {
    await expectRefusedUpFront(Buffer.from(fanOut(16, 's:use').toString().replace('<svg ', '<svg xmlns:s="http://www.w3.org/2000/svg" ')))
  })
  it('draws a few <use> references', async () => {
    await expectPng(await normalizeIcon(fanOut(2), CAPS))
  })
  it.each([
    ['mask', 'mask'],
    ['clipPath', 'clip-path'],
    ['pattern', 'fill'],
    ['marker', 'marker-start'],
    ['filter', 'filter'],
  ])('refuses a %s reference chain', async (tag, attr) => {
    await expectRefusedUpFront(chain(tag, attr))
  })
  it('does not count references to gradients', async () => {
    const fills = svg(`<linearGradient id="g"><stop stop-color="red"/></linearGradient>${'<rect width="16" height="16" fill="url(#g)"/>'.repeat(200)}`)
    expect(await opaquePixels(await expectPng(await normalizeIcon(fills, CAPS)))).toBe(64 * 64)
  })
  it('refuses a chain whose masks share their ids with gradients', async () => {
    const decoys = Array.from({ length: 13 }, (_, i) => `<linearGradient id="x${i}"/>`).join('')
    await expectRefusedUpFront(Buffer.from(chain('mask', 'mask').toString().replace('<defs>', `<defs>${decoys}`)))
  })
  it('refuses an SVG with more than 5000 elements', async () => {
    await expectRefusedUpFront(svg('<rect width="1" height="1"/>'.repeat(5001)))
  })
  it.each([
    ['an entity', '<!ENTITY a "x">'],
    ['a default attribute', '<!ATTLIST image href CDATA "#a">'],
  ])('refuses an SVG whose DTD declares %s', async (_, declaration) => {
    await expectRefusedUpFront(Buffer.from(`<?xml version="1.0"?><!DOCTYPE svg [${declaration}]>${RED_SVG}`))
  })
  it('refuses an SVG that uses XInclude', async () => {
    const included = Buffer.from(`<rect xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>`).toString('base64')
    await expectRefusedUpFront(
      Buffer.from(`<svg ${NS} xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="data:application/xml;base64,${included}"/></svg>`),
    )
  })

  const nested = Buffer.from(svg('<linearGradient id="g"><stop stop-color="red"/></linearGradient>')).toString('base64')
  const nestedGz = gzipSync(svg('<linearGradient id="g"><stop stop-color="red"/></linearGradient>')).toString('base64')
  const styled = (css: string) => svg(`<style>${css}</style><rect width="16" height="16"/>`)
  it.each([
    ['an inline SVG image', svg(image(`data:image/svg+xml;base64,${nested}`))],
    ['an inline image with no type', svg(image(`data:;base64,${nested}`))],
    ['a scheme behind character references', svg(image(`&#100;ata:image/svg+xml;base64,${nested}`))],
    ['a scheme behind a tab', svg(image(`d&#9;ata:image/svg+xml;base64,${nested}`))],
    ['a href led by a control character', svg(image(`\u0001data:image/svg+xml;base64,${nested}`))],
    ['a nested document through <use>', svg(`<use href="data:image/svg+xml;base64,${nested}#g"/>`)],
    ['a CSS line continuation (LF)', styled(`rect{fill:url("da\\\nta:image/svg+xml;base64,${nested}#g")}`)],
    ['a CSS line continuation (CRLF)', styled(`rect{fill:url("da\\\r\nta:image/svg+xml;base64,${nested}#g")}`)],
    ['a CSS line continuation (FF)', styled(`rect{fill:url("da\\\fta:image/svg+xml;base64,${nested}#g")}`)],
    ['a CSS hex escape in an unquoted url', styled(`rect{fill:url(\\64 ata:image/svg+xml;base64,${nested}#g)}`)],
    ['nested gzip through CSS', styled(`rect{fill:url("da\\\nta:application/gzip;base64,${nestedGz}#g")}`)],
    ['a continuation in a style attribute', svg(`<rect width="16" height="16" style="fill:url(da\\\nta:image/svg+xml;base64,${nested}#g)"/>`)],
    ['an upper-case scheme in a fill attribute', svg(`<rect width="16" height="16" fill="url(DATA:image/svg+xml;base64,${nested}#g)"/>`)],
    ['@import', styled(`@import "x.css";`)],
    ['@import of a data: stylesheet behind a continuation', styled(`@import "da\\\nta:text/css;base64,cmVjdHtmaWxsOnJlZH0=";`)],
    ['a CSS url to another document', styled(`rect{fill:url("other.svg#g")}`)],
  ])('refuses %s', async (_, doc) => {
    await expectRefusedUpFront(doc)
  })
  it.each([
    ['a file: URL', 'file:///C:/Windows/win.ini'],
    ['an absolute path', '/etc/hosts'],
    ['a relative path', 'icon.png'],
    ['an http URL', 'http://127.0.0.1:9/a.png'],
  ])('refuses an image loaded from %s', async (_, href) => {
    await expectRefusedUpFront(svg(image(href)))
  })
})

describe('normalizeIcon: render process', () => {
  it('kills the render process when time runs out, leaving none behind', async () => {
    expect(await normalizeIcon(SLOW_SVG, CAPS)).not.toBeNull()
    spawned.mockClear()
    const started = Date.now()
    expect(await normalizeIcon(SLOW_SVG, { ...CAPS, timeoutMs: 1 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
    const child = spawned.mock.results[0]!.value as ChildProcess
    expect(child.signalCode ?? child.exitCode).not.toBeNull()
    expect(isRunning(child.pid!)).toBe(false)
  })
  it('gives up when the render process passes its memory cap', async () => {
    // Interlaced, so the whole 4096² image is decoded at once: well over 100 MB in the render process.
    const large = await solid(4096, 4096).png({ progressive: true }).toBuffer()
    expect(await normalizeIcon(large, CAPS)).not.toBeNull()
    spawned.mockClear()
    expect(await normalizeIcon(large, { ...CAPS, memoryMb: 100 })).toBeNull()
    const child = spawned.mock.results[0]!.value as ChildProcess
    expect(child.exitCode).toBe(3)
  })
})
