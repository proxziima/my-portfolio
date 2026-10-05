import { CONTEXT_NOTE_OPENING } from '@repo/twin/contract'

/**
 * The agent's abuse gate speaks to the model through user-role notes starting with
 * `CONTEXT_NOTE_PREFIX` (@repo/twin/contract). Only its opening `[context` matters for neutralising.
 */
const NOTE_OPENING = new RegExp(CONTEXT_NOTE_OPENING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
/** Invisible format characters (zero-width space/joiners, word joiner, soft hyphen, BOM...). */
const FORMAT_CHARS = /\p{Cf}/gu
/** How an encoded booking notice opens (`encodeNotice` in @repo/twin/contract). */
const NOTICE_OPENING = '{"twinNotice"'

/**
 * Visitor text with every `[context` (any case) turned into `(context`, so it cannot forge a note.
 * Normalised first (NFKC folds fullwidth `［ｃｏｎｔｅｘｔ`, then format characters are stripped), so
 * look-alikes that a model reads as the same opening cannot slip past the match.
 */
export function neutraliseVisitorText(text: string): string {
  const defused = text
    .normalize('NFKC')
    .replace(FORMAT_CHARS, '')
    .replace(NOTE_OPENING, (m) => `(${m.slice(1)}`)
  // `parseNotice` (@repo/twin/contract) reads any message starting `{"twinNotice":1` as a booking
  // system line; a leading space keeps a visitor's own text from rendering as one.
  return defused.startsWith(NOTICE_OPENING) ? ` ${defused}` : defused
}
