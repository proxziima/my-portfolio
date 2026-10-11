import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetTextureFormat, textureFormat } from '@/lib/assets/texture-format'

const okFetch = () => vi.fn(async () => new Response(new Blob([new Uint8Array([1])]))) as unknown as typeof fetch
const bitmap = () => ({ close: vi.fn(), width: 1, height: 1 }) as unknown as ImageBitmap

afterEach(() => resetTextureFormat())

describe('textureFormat', () => {
  it('is avif when the 1×1 AVIF decodes, and closes the probe bitmap', async () => {
    const bmp = bitmap()
    const decode = vi.fn(async () => bmp) as unknown as typeof createImageBitmap
    const fetchImpl = okFetch()
    await expect(textureFormat(fetchImpl, decode)).resolves.toBe('avif')
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/avif;base64,/))
    expect(bmp.close).toHaveBeenCalled()
  })

  it('is webp when decoding rejects', async () => {
    const decode = vi.fn(async () => {
      throw new DOMException('unsupported', 'InvalidStateError')
    }) as unknown as typeof createImageBitmap
    await expect(textureFormat(okFetch(), decode)).resolves.toBe('webp')
  })

  it('is webp when the fetch itself fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('blocked')
    }) as unknown as typeof fetch
    await expect(textureFormat(fetchImpl, vi.fn() as unknown as typeof createImageBitmap)).resolves.toBe('webp')
  })

  it('probes once per session', async () => {
    const decode = vi.fn(async () => bitmap()) as unknown as typeof createImageBitmap
    const fetchImpl = okFetch()
    await textureFormat(fetchImpl, decode)
    await expect(textureFormat(fetchImpl, decode)).resolves.toBe('avif')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
  })
})
