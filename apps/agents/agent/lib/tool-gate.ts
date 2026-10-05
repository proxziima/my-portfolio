import { getConversation } from '@repo/twin/db'
import type { ToolName } from './skills/define'
import { toolsFor } from './skills/compose'
import { db } from './db'

/**
 * True when an active skill grants this tool for the session's current state. A session without
 * a conversation row gets nothing; `ensureConversation` runs at turn start, before any step.
 */
export async function toolGranted(sessionId: string, tool: ToolName): Promise<boolean> {
  const conversation = await getConversation(db(), sessionId)
  return conversation !== null && toolsFor(conversation.state).includes(tool)
}
