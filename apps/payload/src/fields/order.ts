import type { NumberField } from 'payload'

export const orderField = (): NumberField => ({
  name: 'order',
  type: 'number',
  required: true,
  defaultValue: 0,
  index: true,
  admin: { position: 'sidebar', description: 'Lower numbers come first.' },
})
