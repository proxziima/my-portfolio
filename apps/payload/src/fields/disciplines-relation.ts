import type { RelationshipField } from 'payload'

export const disciplinesField = (description: string): RelationshipField => ({
  name: 'disciplines',
  type: 'relationship',
  relationTo: 'disciplines',
  hasMany: true,
  admin: { position: 'sidebar', description },
})
