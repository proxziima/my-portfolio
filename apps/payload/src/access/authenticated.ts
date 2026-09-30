import type { PayloadRequest } from 'payload'

// Returns a plain boolean so it fits both collection `access` and `admin` access slots.
export const authenticated = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)
