import type { TextField } from 'payload'

// Absolute http(s), mailto:, a single-slash path (no `//host` or `/\host`), or a #anchor.
const ALLOWED = /^(https?:\/\/|mailto:|\/(?![\/\\])|#)/i
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f]/

/** Returns `true` for a safe link, otherwise the error message. Blocks `javascript:` and friends. */
export const validateLinkUrl = (value: string): true | string => {
  if (FORBIDDEN_CHARS.test(value)) return 'Links cannot contain spaces or control characters.'
  return ALLOWED.test(value) || 'Use an http(s)://, mailto:, / or # link.'
}

export const urlField = (name = 'url', required = false): TextField => ({
  name,
  type: 'text',
  required,
  // A custom `validate` replaces Payload's default, so `required` is handled here.
  validate: (value: string | null | undefined, { required: isRequired }) => {
    if (!value) return isRequired ? 'This field is required.' : true
    return validateLinkUrl(value)
  },
})
