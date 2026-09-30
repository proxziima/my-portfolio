import type { TextField } from 'payload'

const ALLOWED = /^(https?:\/\/|mailto:|\/|#)/i

export const urlField = (name = 'url', required = false): TextField => ({
  name,
  type: 'text',
  required,
  validate: (value: string | null | undefined) =>
    !value || ALLOWED.test(value) || 'Use an http(s)://, mailto:, / or # link.',
})
