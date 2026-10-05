import type { EveEvalStreamEvent } from 'eve/evals'

/** Outputs of every completed call to `tool` among the events, in stream order. */
export function toolResults(events: readonly EveEvalStreamEvent[], tool: string): unknown[] {
  return events.flatMap((e) =>
    e.type === 'action.result' &&
    e.data.result.kind === 'tool-result' &&
    e.data.result.toolName === tool
      ? [e.data.result.output]
      : [],
  )
}

/** Index of the first request for `tool` among the events, or -1 when it was never requested. */
export function firstRequestOf(events: readonly EveEvalStreamEvent[], tool: string): number {
  return events.findIndex(
    (e) =>
      e.type === 'actions.requested' &&
      e.data.actions.some((a) => 'toolName' in a && a.toolName === tool),
  )
}

/** Index of the first visible assistant text among the events, or -1 when there was none. */
export function firstTextOf(events: readonly EveEvalStreamEvent[]): number {
  return events.findIndex((e) => e.type === 'message.appended' || e.type === 'message.completed')
}

/** The `status` field of a tool output (e.g. `schedule_call`'s rendered/refused), if it has one. */
export function statusOf(output: unknown): unknown {
  return typeof output === 'object' && output !== null && 'status' in output
    ? output.status
    : undefined
}
