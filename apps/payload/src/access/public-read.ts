import type { Access } from 'payload'
import { authenticated } from './authenticated'

export const publicRead: Access = () => true

export const publicContentAccess = {
  read: publicRead,
  create: authenticated,
  update: authenticated,
  delete: authenticated,
}

export const publicGlobalAccess = { read: publicRead, update: authenticated }
