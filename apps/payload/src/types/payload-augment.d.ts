import type { Config } from '@repo/cms-types'

declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}
