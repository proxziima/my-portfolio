import { createRequire } from 'node:module'
import type { StageResult } from './stage.ts'

const require = createRequire(import.meta.url)
const wawoff2 = require('wawoff2') as { compress: (ttf: Uint8Array) => Promise<Uint8Array> }

/**
 * A font into `dir`, next to the layout that loads it (`app/fonts/`, `app/(os)/fonts/`). Not hashed and not under
 * `public/`: `next/font/local` hashes and serves the file itself. A `.woff2` source passes through byte for byte (the
 * Google faces, kept exactly as Google serves them); a `.ttf` is compressed to WOFF2. No manifest value: next/font only
 * takes a literal path, so the layout names the file and a unit test holds it to this stage's output.
 */
export async function fontStage(source: string, dir: string, bytes: Uint8Array): Promise<StageResult> {
  const name = source.replace(/^.*\//, '')
  if (/\.woff2$/i.test(name)) return { outputs: [{ path: `${dir}/${name}`, bytes, label: 'woff2' }] }
  if (!/\.ttf$/i.test(name)) throw new Error(`font stage: ${source} is neither .woff2 nor .ttf`)
  const woff2 = await wawoff2.compress(bytes)
  return { outputs: [{ path: `${dir}/${name.replace(/\.ttf$/i, '.woff2')}`, bytes: woff2, label: 'woff2' }], tools: { wawoff2: '2.0.1' } }
}
