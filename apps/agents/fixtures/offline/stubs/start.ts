import { startPayloadMcpStub } from './payload-mcp'

/** Starts the Payload MCP stub; returned closers run in eval teardown. */
export async function startStubs(): Promise<() => Promise<void>> {
  const servers = await Promise.all([startPayloadMcpStub(4310)])
  return async () => {
    await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))))
  }
}
