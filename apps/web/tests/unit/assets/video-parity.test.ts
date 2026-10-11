import { describe, expect, it } from 'vitest'
import { compositeChain, coverCrop, judge, parseSsim, parseVmaf, planeStats, underChain, VIDEO_GATE, type VideoMetrics } from '@/scripts/assets/parity/video'

describe('coverCrop', () => {
  it('crops a 4:3 frame to the 5:4 screen as object-fit: cover does (sides cut, full height)', () => {
    expect(coverCrop(640, 480, 1280, 1024)).toEqual({ width: 600, height: 480, x: 20, y: 0 })
  })

  it('cuts top and bottom when the box is wider than the frame', () => {
    expect(coverCrop(640, 480, 1600, 900)).toEqual({ width: 640, height: 360, x: 0, y: 60 })
  })

  it('keeps the whole frame when the aspects match', () => {
    expect(coverCrop(640, 480, 1280, 960)).toEqual({ width: 640, height: 480, x: 0, y: 0 })
  })
})

describe('planeStats', () => {
  it('is flat for a flat plane', () => {
    expect(planeStats(new Uint8Array(16 * 8).fill(100), 16, 8)).toEqual({ mean: 100, std: 0, hf: 0 })
  })

  it('sees fine grain as high-frequency energy, and smoothing as its loss', () => {
    const w = 32
    const h = 32
    const grain = new Uint8Array(w * h).map((_, i) => ((i + Math.floor(i / w)) % 2 ? 140 : 100))
    // the same plane through a 3×3 box blur: same mean, far less energy
    const blurred = new Uint8Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy
            const xx = x + dx
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
            s += grain[yy * w + xx]!
            n++
          }
        blurred[y * w + x] = Math.round(s / n)
      }
    const a = planeStats(grain, w, h)
    const b = planeStats(blurred, w, h)
    expect(a.mean).toBe(120)
    expect(a.std).toBe(20)
    expect(b.hf).toBeLessThan(a.hf * 0.5)
  })
})

describe('ffmpeg output parsing', () => {
  it('takes the final SSIM All value', () => {
    const log = '[Parsed_ssim_4 @ 0] SSIM Y:0.99 (20) U:0.99 V:0.99 All:0.996123 (24.1)\n'
    expect(parseSsim(log)).toBe(0.996123)
  })

  it('takes the VMAF score', () => {
    expect(parseVmaf('[Parsed_libvmaf_7 @ 0] VMAF score: 97.421337\n')).toBe(97.421337)
  })

  it('throws when the metric is missing', () => {
    expect(() => parseSsim('nothing')).toThrow(/SSIM/)
    expect(() => parseVmaf('nothing')).toThrow(/VMAF/)
  })
})

describe('judge', () => {
  const ok: VideoMetrics = { frames: { source: 900, encode: 900 }, ssim: 0.997, vmaf: 96, lumaMean: 1.005, lumaStd: 0.99, hf: 0.97 }

  it('passes an encode inside every threshold', () => {
    expect(judge(ok)).toEqual([])
  })

  it('fails on each threshold on its own', () => {
    expect(judge({ ...ok, frames: { source: 900, encode: 899 } })).toHaveLength(1)
    expect(judge({ ...ok, ssim: VIDEO_GATE.ssim - 1e-6 })).toHaveLength(1)
    expect(judge({ ...ok, vmaf: 94.99 })).toHaveLength(1)
    expect(judge({ ...ok, lumaMean: 1.021 })).toHaveLength(1)
    expect(judge({ ...ok, lumaMean: 0.979 })).toHaveLength(1)
    expect(judge({ ...ok, lumaStd: 0.969 })).toHaveLength(1)
    expect(judge({ ...ok, hf: 0.949 })).toHaveLength(1)
  })

  it('accepts the thresholds themselves', () => {
    expect(judge({ ...ok, ssim: 0.995, vmaf: 95, lumaStd: 0.97, hf: 0.95 })).toEqual([])
  })
})

describe('composite filter', () => {
  const crop = coverCrop(640, 480, 1280, 1024)

  it('veils the under once and adds the layer at its opacity, frame by index', () => {
    const under = underChain('2:v', crop, ['u0', 'u1'])
    expect(under).toContain('scale=600:480')
    expect(under).toContain('colorchannelmixer=rr=0.8600:gg=0.8600:bb=0.8600')
    expect(under).toContain('split=2[u0][u1]')
    const layer = compositeChain('0:v', 'u0', 'e', 0.1, crop)
    expect(layer).toContain('setpts=N/(30*TB)')
    expect(layer).toContain('crop=600:480:20:0')
    expect(layer).toContain('colorchannelmixer=rr=0.1:gg=0.1:bb=0.1')
    expect(layer).toMatch(/\[el\]\[u0\]blend=all_mode=addition:shortest=1,format=yuv420p\[e\]$/)
  })
})
