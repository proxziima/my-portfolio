import localFont from 'next/font/local'

/*
 * The letter's faces, for both root documents that set it (the (site) layout and global-not-found). Self-hosted: the
 * woff2 files beside this module are Google's own `latin` subsets, written by the asset pipeline (`siteFonts.*` in
 * scripts/assets/recipes.ts), so no build depends on reaching Google.
 */

// `optional` (spec §4.1): the preloaded Inter is there for the first paint on a normal load, and a load that misses it
// keeps the fallback for the page's life, so the letter never re-wraps under the reader. The matched per-platform
// fallbacks (styles/font-fallbacks.css) make that rare view look as close to Inter as a system face can, and replace
// next/font's single Arial one; Turbopack ignores `adjustFontFallback: false` unless `fallback` is given, so both are
// set (literals: next/font reads them statically)
export const inter = localFont({
  src: [{ path: './Inter-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-inter',
  display: 'optional',
  preload: true,
  adjustFontFallback: false,
  fallback: ['Inter Fallback Segoe', 'Inter Fallback Roboto', 'Inter Fallback Helvetica', 'Inter Fallback Arial'],
})

// only Curious mode's notes use it: never preload it ahead of the body face. `swap`, not `optional`: it is fetched when the
// notes first render, past any block period, so `optional` would show the notes in the fallback; its swap moves only the
// notes, which are out of flow (spec §4.1). One variable file serves both weights, as Google served it
export const caveat = localFont({
  src: [
    { path: './Caveat-latin.woff2', weight: '500', style: 'normal' },
    { path: './Caveat-latin.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-caveat',
  display: 'swap',
  preload: false,
})
