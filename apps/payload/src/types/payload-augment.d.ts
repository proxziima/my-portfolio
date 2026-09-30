import type { Config } from '@repo/cms-types'

declare module 'payload' {
  // Module augmentation must be an interface; it only merges the generated Config in.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface GeneratedTypes extends Config {}
}
