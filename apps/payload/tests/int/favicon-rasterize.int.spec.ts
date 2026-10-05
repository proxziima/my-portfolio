// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { rasterizeSvg } from '@/favicons/rasterize'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const svg = (body: string, size = 'width="16" height="16"') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${size}>${body}</svg>`)

/** How many pixels of a PNG are not fully transparent. */
async function opaquePixels(png: Buffer): Promise<number> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++
  return count
}

describe('rasterizeSvg', () => {
  it('renders an SVG to a 64×64 PNG', async () => {
    const png = await rasterizeSvg(svg('<rect width="16" height="16" fill="blue"/>'))
    expect(png?.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
    const meta = await sharp(png!).metadata()
    expect(meta).toMatchObject({ format: 'png', width: 64, height: 64 })
    expect(await opaquePixels(png!)).toBe(64 * 64)
  })
  it('keeps the aspect ratio of a non-square icon, padding with transparency', async () => {
    const png = await rasterizeSvg(svg('<rect width="32" height="16" fill="red"/>', 'width="32" height="16"'))
    expect(await sharp(png!).metadata()).toMatchObject({ width: 64, height: 64 })
    expect(await opaquePixels(png!)).toBe(64 * 32)
  })
  it('returns null for malformed SVG or bytes that are not an image', async () => {
    expect(await rasterizeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect'))).toBeNull()
    expect(await rasterizeSvg(Buffer.from('not an image at all'))).toBeNull()
  })
  it('returns null when the rendered size exceeds the pixel cap', async () => {
    expect(await rasterizeSvg(svg('<rect width="1" height="1"/>', 'width="100000" height="100000"'))).toBeNull()
  })
  it('never loads external references', async () => {
    let requests = 0
    const server = http.createServer((_req, res) => {
      requests++
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const png = await rasterizeSvg(
        svg(
          `<style>@import url("${base}/s.css");</style>` +
            `<image width="16" height="16" href="${base}/a.png"/><image width="16" height="16" xlink:href="${base}/b.png"/>` +
            '<image width="16" height="16" href="file:///etc/hosts"/><image width="16" height="16" href="icon.png"/>',
        ),
      )
      expect(png).not.toBeNull()
      expect(await opaquePixels(png!)).toBe(0)
      expect(requests).toBe(0)
    } finally {
      server.close()
    }
  })
})
