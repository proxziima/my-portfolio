/**
 * Whether `error` is an abort. The AI SDK rethrows aborts unwrapped and never retries them: a
 * DOMException named TimeoutError (from AbortSignal.timeout) or AbortError.
 */
export function isAbort(error: unknown): boolean {
  return error instanceof Error || error instanceof DOMException ? error.name === 'TimeoutError' || error.name === 'AbortError' : false
}
