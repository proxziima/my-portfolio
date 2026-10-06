/** How every server-written context note opens; the web BFF neutralises it in visitor text. */
export const CONTEXT_NOTE_OPENING = '[context'

/**
 * Prefix of every server-written user-role note (the agent's abuse gate speaks to the model
 * through them). Shared so the agent that writes notes and the web BFF that neutralises forged
 * ones can't drift apart.
 */
export const CONTEXT_NOTE_PREFIX = `${CONTEXT_NOTE_OPENING}, not from the visitor]`
