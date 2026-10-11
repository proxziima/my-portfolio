import { fileURLToPath } from 'node:url'

/** Committed sources, never served (spec §4.5). */
export const SOURCE_DIR = fileURLToPath(new URL('../../assets-src/', import.meta.url))

export type ImageFormat = 'avif' | 'webp'

export interface ImageParity {
  /** Minimum SSIM against the source. */
  ssim: number
  /** Judge the image composited as the page draws it (plus-lighter at this opacity over the screen slab). */
  composite?: { mode: 'plus-lighter' | 'normal'; opacity: number }
}

/** One asset as pure data; `build.ts` turns it into hashed outputs and a manifest value. */
export type Recipe =
  | { id: string; kind: 'copy'; source: string }
  | { id: string; kind: 'image'; source: string; widths: number[] | 'source'; formats: ImageFormat[]; parity: ImageParity }
  | { id: string; kind: 'texture'; source: string; parity: ImageParity }
  | { id: string; kind: 'model'; source: string; quantize: { position: number; texcoord: number } }
  | { id: string; kind: 'video'; source: string; codecs: Array<'av1' | 'vp9' | 'h264'>; layer: { opacity: number } }
  /** `dir`: where the woff2 lands, relative to `apps/web` (next to the layout whose `next/font/local` names it). */
  | { id: string; kind: 'font'; source: string; dir: string }

const AUDIO = ['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6', 'mouse-down', 'mouse-up', 'office']
const camel = (name: string) => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

/** Dotted ids become the manifest's nesting: 'desk.computer.model' → ASSETS.desk.computer.model. */
export const RECIPES: readonly Recipe[] = [
  { id: 'desk.computer.model', kind: 'model', source: 'desk/computer.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.decor.model', kind: 'model', source: 'desk/decor.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.environment.model', kind: 'model', source: 'desk/environment.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.computer.texture', kind: 'texture', source: 'desk/computer.webp', parity: { ssim: 0.995 } },
  { id: 'desk.decor.texture', kind: 'texture', source: 'desk/decor.webp', parity: { ssim: 0.995 } },
  { id: 'desk.environment.texture', kind: 'texture', source: 'desk/environment.webp', parity: { ssim: 0.995 } },
  { id: 'desk.screen.smudges', kind: 'image', source: 'desk/screen/smudges.jpg', widths: [1280, 2048], formats: ['avif', 'webp'], parity: { ssim: 0.998, composite: { mode: 'plus-lighter', opacity: 0.12 } } },
  { id: 'desk.screen.shadow', kind: 'image', source: 'desk/screen/shadow.png', widths: 'source', formats: ['avif', 'webp'], parity: { ssim: 0.995, composite: { mode: 'normal', opacity: 1 } } },
  { id: 'desk.screen.staticBase', kind: 'video', source: 'desk/screen/static-base.mp4', codecs: ['av1', 'vp9', 'h264'], layer: { opacity: 0.5 } },
  { id: 'desk.screen.staticLayer', kind: 'video', source: 'desk/screen/static-layer.mp4', codecs: ['av1', 'vp9', 'h264'], layer: { opacity: 0.1 } },
  ...AUDIO.map((n): Recipe => ({ id: `desk.audio.${camel(n)}`, kind: 'copy', source: `desk/audio/${n}.mp3` })),
  // the light bulb bursting (features/blowout): fetched on the second rapid click, decoded once
  { id: 'blowout.bulb', kind: 'copy', source: 'blowout/bulb-explode.mp3' },
  // shown at 2.8rem (44.8 px): 64 for 1×, 128 for 2×, 192 so a 3× phone never upscales
  { id: 'theme.rockerOn', kind: 'image', source: 'theme-switch/rocker-on.webp', widths: [64, 128, 192], formats: ['avif', 'webp'], parity: { ssim: 0.99 } },
  { id: 'theme.rockerOff', kind: 'image', source: 'theme-switch/rocker-off.webp', widths: [64, 128, 192], formats: ['avif', 'webp'], parity: { ssim: 0.99 } },
  // the canvas loads the atlas with `new Image()`, which has no <picture> fallback: WebP only
  { id: 'theme.rockerAtlas', kind: 'image', source: 'theme-switch/rocker-atlas.webp', widths: 'source', formats: ['webp'], parity: { ssim: 0.995 } },
  // the site's faces, self-hosted so no build fetches from Google: each is Google's own `latin` subset, byte for byte
  // what next/font/google shipped (fetched with its user agent; licences beside each file). Latin only: no CMS text the
  // faces render has a character in the other subsets' unicode-ranges (formulas set in Times New Roman, emoji fall back)
  // https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2 (variable, wght 100–900; OFL)
  { id: 'siteFonts.inter', kind: 'font', source: 'fonts/Inter-latin.woff2', dir: 'app/fonts' },
  // https://fonts.gstatic.com/s/caveat/v23/Wnz6HAc5bAfYB2Q7ZjYYiAzcPA.woff2 (variable, wght 400–700; OFL)
  { id: 'siteFonts.caveat', kind: 'font', source: 'fonts/Caveat-latin.woff2', dir: 'app/fonts' },
  { id: 'osFonts.millennium', kind: 'font', source: 'fonts/Millennium.ttf', dir: 'app/(os)/fonts' },
  { id: 'osFonts.millenniumBold', kind: 'font', source: 'fonts/Millennium-Bold.ttf', dir: 'app/(os)/fonts' },
  // https://fonts.gstatic.com/s/ultra/v25/zOLy4prXmrtY-uT9wrKh68xE.woff2 (wght 400; Apache-2.0)
  { id: 'osFonts.ultra', kind: 'font', source: 'fonts/Ultra-latin.woff2', dir: 'app/(os)/fonts' },
]
