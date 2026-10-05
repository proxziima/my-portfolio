export const CHIP_LINK_CLASS = 'fav'
export const CHIP_CLASS = 'chip'
export const CHIP_IMG_CLASS = 'chip-img'
export const CURIOUS_TRIGGER_CLASS = 'curiosity-trigger'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

// Keep in sync with apps/payload/src/fields/link-url.ts (the CMS-side validator).
const SAFE_URL = /^(https?:\/\/|mailto:|\/(?![\/\\])|#)/i
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f]/
export const safeHref = (url: string | null | undefined): string | undefined => {
  const value = url?.trim()
  return value && !FORBIDDEN_CHARS.test(value) && SAFE_URL.test(value) ? value : undefined
}
export const isExternal = (href: string) => /^https?:\/\//i.test(href)

/** A chip link's content: label, text chip, and optionally a link and an icon image (logo or favicon). */
export interface ChipLinkProps {
  label: string
  chip: string
  href?: string | null
  icon?: string
}

/** Only http(s) image URLs reach `src`; anything else falls back to the text chip. */
export const safeIcon = (icon: string | undefined): string | undefined => (icon && isExternal(icon) ? icon : undefined)

export function chipLinkHtml({ label, chip, href: url, icon }: ChipLinkProps): string {
  const href = safeHref(url)
  const attrs = href
    ? ` href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`
    : ''
  const src = safeIcon(icon)
  const mark = src
    ? `<img class="${CHIP_CLASS} ${CHIP_IMG_CLASS}" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`
    : `<i class="${CHIP_CLASS}" aria-hidden="true">${escapeHtml(chip)}</i>`
  return `<a class="${CHIP_LINK_CLASS}"${attrs}>${mark}<span>${escapeHtml(label)}</span></a>`
}

export function curiousToggleHtml(word: string): string {
  return (
    `<button class="${CURIOUS_TRIGGER_CLASS}" type="button" role="switch" aria-checked="false" aria-label="Curious mode">` +
    `<span class="curiosity-word">${escapeHtml(word)}</span>` +
    `<span class="curiosity-switch-track" aria-hidden="true"><span class="curiosity-switch-thumb"></span></span></button>`
  )
}
