import type { TextField } from 'payload'

export const chipField = (): TextField => ({
  name: 'chip',
  type: 'text',
  required: true,
  maxLength: 3,
  admin: { description: 'Up to 3 characters shown in the 16px favicon chip (e.g. "A", "TL", "gh").' },
})
