import { defineEvalConfig } from 'eve/evals'

/** Live suite: deterministic assertions against the real model and the real knowledge base. */
export default defineEvalConfig({ maxConcurrency: 3, timeoutMs: 180_000 })
