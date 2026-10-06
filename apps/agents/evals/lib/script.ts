import type { EveEvalContext, EveEvalTurn } from 'eve/evals'
import { loadJson } from 'eve/evals/loaders'
import { z } from 'zod'

/** One scripted conversation: the visitor's messages, sent in order on one session. */
export const Script = z.object({ id: z.string().min(1), turns: z.array(z.string().min(1)).min(1) })
export type Script = z.infer<typeof Script>

/** Loads a dataset of scripts; the path is relative to the app root, as eve's loaders resolve it. */
export async function loadScripts(path: string): Promise<Script[]> {
  return z.array(Script).parse(await loadJson(path))
}

/** Sends every turn of a script on one session, handing each settled turn to `check`. */
export async function runScript(
  t: EveEvalContext,
  turns: readonly string[],
  check: (turn: EveEvalTurn) => void,
): Promise<EveEvalTurn> {
  const [first, ...rest] = turns
  if (first === undefined) throw new Error('A script needs at least one turn')
  let turn = await t.send(first)
  check(turn)
  for (const next of rest) {
    turn = await turn.session.send(next)
    check(turn)
  }
  return turn
}
