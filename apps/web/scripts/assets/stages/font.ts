import { createRequire } from 'node:module'
import type { StageResult } from './stage.ts'

const require = createRequire(import.meta.url)
const wawoff2 = require('wawoff2') as { compress: (ttf: Uint8Array) => Promise<Uint8Array> }

/**
 * TTF → WOFF2 next to the layout that loads it (`app/(os)/fonts/`). Not hashed and not under `public/`:
 * `next/font/local` hashes and serves the file itself.
 */
export async function fontStage(source: string, bytes: Uint8Array): Promise<StageResult> {
  const woff2 = await wawoff2.compress(bytes)
  const path = `app/(os)/fonts/${source.replace(/^.*\//, '').replace(/\.ttf$/i, '.woff2')}`
  return { outputs: [{ path, bytes: woff2, label: 'woff2' }], value: path, tools: { wawoff2: '2.0.1' } }
}
