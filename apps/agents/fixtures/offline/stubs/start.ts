import { startPayloadMcpStub } from './payload-mcp'
import { startTelegramStub } from './telegram'

/** Starts both stubs; returned closers run in eval teardown. */
export async function startStubs(): Promise<() => Promise<void>> {
  const servers = await Promise.all([startPayloadMcpStub(4310), startTelegramStub(4312)])
  return async () => {
    await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))))
  }
}
