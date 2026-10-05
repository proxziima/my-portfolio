/**
 * The agent's abuse gate speaks to the model through user-role notes starting with this prefix.
 * Copied from `CONTEXT_NOTE_PREFIX` in `apps/agents/agent/lib/abuse.ts` (keep them in sync): the
 * web app never imports agent code. Only its opening `[context` matters for neutralising.
 */
const CONTEXT_NOTE_OPENING = /\[context/gi

/** Visitor text with every `[context` (any case) turned into `(context`, so it cannot forge a note. */
export function neutraliseVisitorText(text: string): string {
  return text.replace(CONTEXT_NOTE_OPENING, (m) => `(${m.slice(1)}`)
}

/**
 * `clientContext` also reaches the model as user-role text, so it gets the same treatment. In
 * serialised JSON `[context` can only occur inside a string (key or value), so one pass over the
 * serialised form rewrites exactly the strings and nothing structural.
 */
export function neutraliseVisitorContext<T>(value: T): T {
  return JSON.parse(neutraliseVisitorText(JSON.stringify(value))) as T
}
