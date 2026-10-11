import { describe, expect, it } from 'vitest'
import { contentHash, hashedName } from '@/scripts/assets/hash'

describe('hash', () => {
  it('is a stable 10-char hex of the bytes', () => {
    expect(contentHash(Buffer.from('abc'))).toBe('ba7816bf8f')
  })
  it('inserts the hash before the extension', () => {
    expect(hashedName('desk/computer.glb', Buffer.from('abc'))).toBe('desk/computer.ba7816bf8f.glb')
    expect(hashedName('desk/screen/smudges.jpg', Buffer.from('abc'), '1280w.avif')).toBe('desk/screen/smudges.1280w.ba7816bf8f.avif')
  })
  it('takes a bare extension as the suffix', () => {
    expect(hashedName('desk/screen/shadow.png', Buffer.from('abc'), 'webp')).toBe('desk/screen/shadow.ba7816bf8f.webp')
  })
})
