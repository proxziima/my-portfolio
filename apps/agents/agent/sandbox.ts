import { defineSandbox } from 'eve/sandbox'
import { JustBashSandbox } from 'eve/sandbox/just-bash'

// eve prepares a sandbox at `eve build` even with `defaultTools: false`, and without this file it
// picks a provider by host availability (Docker, then microsandbox, then just-bash), so the same
// source builds differently per machine. Nothing in this agent runs code or touches files, so the
// pure-JS just-bash sandbox is enough, and builds and containers must not depend on Docker being
// present. `just-bash` is a pinned dependency because eve only auto-installs it under `eve dev`.
export const environment = JustBashSandbox.environment()
export default defineSandbox(() => environment.open())
