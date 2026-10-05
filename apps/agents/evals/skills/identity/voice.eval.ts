import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'

const EXCLAIM = /!/
const EMOJI = /\p{Extended_Pictographic}/u
const MARKDOWN = /^\s*([-*•]|\d+\.)\s|\*\*|^#+\s/m
const EM_DASH = /—/
const VC = /\bvc\b/i
const PORTUGUESE = /\b(você|tudo|não|sim|pra|com|meu|minha|hoje|é)\b/i

/** Every rule a reply in my voice keeps; returns the first one broken, or null. */
function voiceViolation(m: string): string | null {
  if (EXCLAIM.test(m)) return 'exclamation mark'
  if (EMOJI.test(m)) return 'emoji'
  if (MARKDOWN.test(m)) return 'markdown'
  if (EM_DASH.test(m)) return 'em dash'
  if (VC.test(m)) return '"vc"'
  const long = m.split(/\n\s*\n/).find((p) => p.trim().split(/\s+/).length > 40)
  if (long) return 'a paragraph over 40 words'
  return null
}

/** Voice: short Portuguese bursts with none of the assistant tics, on a greeting and a deep question. */
export default [
  { id: 'greeting-pt', message: 'Oi, tudo bem?' },
  { id: 'background-pt', message: 'Me fale mais sobre o seu background técnico' },
].map((c) =>
  defineEval({
    description: `voice: ${c.id}`,
    tags: ['live', 'identity'],
    async test(t) {
      const turn = await t.send(c.message)
      t.check(
        turn.message,
        satisfies((m: string | undefined) => voiceViolation(m ?? '') === null, `keeps the voice (${c.id})`),
      )
      t.check(
        turn.message,
        satisfies((m: string | undefined) => PORTUGUESE.test(m ?? ''), `replies in Portuguese (${c.id})`),
      )
      t.succeeded()
    },
  }),
)
