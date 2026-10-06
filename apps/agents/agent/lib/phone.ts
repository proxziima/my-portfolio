/** A handle as E.164, or null. iMessage handles are phone numbers or Apple IDs, and only the former can identify the owner (same rule as the personal-agent-template's iMessage channel). */
export function toE164(handle: string): string | null {
  const trimmed = handle.trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null
  const normalized = trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/\D/g, '')}` : `+${trimmed.replace(/\D/g, '')}`
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}
