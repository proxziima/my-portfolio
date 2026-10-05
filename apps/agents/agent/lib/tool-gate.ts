import { getConversation } from '@repo/twin/db'
import { integrationConfig, type Integration } from '@repo/twin/env'
import type { ToolName } from './skills/define'
import { toolsFor } from './skills/compose'
import { db } from './db'
import { getEnv } from './env'

/** Tools that act through an optional integration; without it the model never sees them. */
const TOOL_INTEGRATION: Partial<Record<ToolName, Integration>> = {
  check_availability: 'google',
  schedule_call: 'cal',
  web_search: 'exa',
}

/**
 * True when the tool's integration (if any) is configured and an active skill grants the tool for
 * the session's current state. A session without a conversation row gets nothing;
 * `ensureConversation` runs at turn start, before any step.
 */
export async function toolGranted(sessionId: string, tool: ToolName): Promise<boolean> {
  const needs = TOOL_INTEGRATION[tool]
  if (needs && !integrationConfig(getEnv(), needs)) return false
  const conversation = await getConversation(db(), sessionId)
  return conversation !== null && toolsFor(conversation.state).includes(tool)
}
