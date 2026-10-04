import type { TextField } from 'payload'

/** A required text field with a default, so a global is valid before anyone edits it. */
export const requiredText = (name: string, defaultValue: string, description?: string): TextField => ({
  name,
  type: 'text',
  required: true,
  defaultValue,
  admin: description ? { description } : undefined,
})
