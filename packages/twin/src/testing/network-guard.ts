import { afterEach } from 'vitest'

/**
 * Vitest setup file: no test may reach the real network. Global `fetch` is replaced by a guard
 * that rejects with an "un-mocked network call" error. A test that needs fetch stubs it
 * (`vi.stubGlobal('fetch', ...)`), which replaces the guard; `vi.unstubAllGlobals()` restores
 * the guard, not the real fetch. Every blocked call is also recorded and fails the test in
 * `afterEach`, so code that swallows fetch errors (fallbacks, never-throw classifiers) cannot
 * hide a real call. PGlite runs in-process and never touches fetch, so test databases still work.
 */
const blocked: string[] = []

function describe(input: unknown, init?: RequestInit): string {
  if (input instanceof Request) return `${init?.method ?? input.method} ${input.url}`
  return `${init?.method ?? 'GET'} ${String(input)}`
}

const guard: typeof fetch = async (input, init) => {
  const call = describe(input, init)
  blocked.push(call)
  throw new Error(`Un-mocked network call: ${call}. Stub fetch (vi.stubGlobal) or mock the client.`)
}

globalThis.fetch = guard

/** The calls blocked since the last drain, clearing them (for the guard's own tests). */
export function drainBlockedNetworkCalls(): string[] {
  return blocked.splice(0)
}

afterEach(() => {
  const calls = drainBlockedNetworkCalls()
  if (calls.length > 0) throw new Error(`Test made un-mocked network calls:\n${calls.join('\n')}`)
})
