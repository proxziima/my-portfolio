import { hashedName } from '../hash.ts'
import { assetPath, type StageResult } from './stage.ts'

/** Hashed passthrough (audio): the bytes are already as small as they should be. */
export function copyStage(source: string, bytes: Uint8Array): StageResult {
  const path = assetPath(hashedName(source, bytes))
  return { outputs: [{ path, bytes }], value: path }
}
