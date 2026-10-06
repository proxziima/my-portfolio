import type { SelectField } from 'payload'

/** Messenger presence states, as the MSN status picker lists them. */
export const PRESENCE_STATUSES = [
  { label: 'Available', value: 'available' },
  { label: 'Busy', value: 'busy' },
  { label: 'Away', value: 'away' },
  { label: 'Offline', value: 'offline' },
]

/** A required Messenger presence select, `available` by default. */
export const presenceStatusField = (description?: string): SelectField => ({
  name: 'status',
  type: 'select',
  required: true,
  defaultValue: 'available',
  options: PRESENCE_STATUSES,
  ...(description ? { admin: { description } } : {}),
})
