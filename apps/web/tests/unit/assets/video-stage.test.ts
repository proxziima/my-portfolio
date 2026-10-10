import { describe, expect, it } from 'vitest'
import { CODECS, sourceType } from '@/scripts/assets/stages/video'

const base = { pix_fmt: 'yuv420p', width: 640, height: 480 }

describe('sourceType', () => {
  it('names AV1 Main 8-bit at the level the encoder chose', () => {
    expect(sourceType('av1', { ...base, codec_name: 'av1', profile: 'Main', level: 4 })).toBe('video/webm; codecs="av01.0.04M.08"')
  })

  it('names VP9 profile 0 8-bit level 3.0', () => {
    expect(sourceType('vp9', { ...base, codec_name: 'vp9', profile: 'Profile 0' })).toBe('video/webm; codecs="vp09.00.30.08"')
  })

  it('names H.264 Main at its level', () => {
    expect(sourceType('h264', { ...base, codec_name: 'h264', profile: 'Main', level: 30 })).toBe('video/mp4; codecs="avc1.4D401E"')
  })

  it('refuses a stream the type would misdescribe', () => {
    expect(() => sourceType('h264', { ...base, codec_name: 'h264', profile: 'High', level: 30 })).toThrow()
    expect(() => sourceType('h264', { ...base, codec_name: 'h264', profile: 'Main', level: 31 })).toThrow()
    expect(() => sourceType('av1', { ...base, codec_name: 'av1', profile: 'Main', level: 4, pix_fmt: 'yuv420p10le' })).toThrow()
    expect(() => sourceType('vp9', { ...base, codec_name: 'vp9', profile: 'Profile 0', width: 1280, height: 720 })).toThrow()
  })
})

describe('CODECS', () => {
  it('searches the spec ranges, with only higher-quality CRFs below them', () => {
    expect(CODECS.av1.range).toEqual([16, 40])
    expect(CODECS.vp9.range).toEqual([16, 40])
    expect(CODECS.h264.range).toEqual([14, 28])
    for (const spec of Object.values(CODECS)) expect(spec.floor).toBeLessThan(spec.range[0])
  })

  it('keeps the grain: no temporal filtering in AV1 or VP9, grain tuning in H.264', () => {
    expect(CODECS.av1.args(24).join(' ')).toContain('enable-tf=0')
    expect(CODECS.vp9.args(24).join(' ')).toContain('-arnr-maxframes 0')
    expect(CODECS.h264.args(18).join(' ')).toContain('-tune grain')
  })
})
