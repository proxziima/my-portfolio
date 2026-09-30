import path from 'path'
import { fileURLToPath } from 'url'

/** `apps/payload`: this file lives in `src/uploads/`. */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Where an upload collection stores its files: `$MEDIA_DIR` / `$SCENES_DIR` when set (the Docker image
 * points them at the `/data` volume), otherwise `public/<folder>` inside the app, as in development.
 */
export const uploadStaticDir = (envVar: 'MEDIA_DIR' | 'SCENES_DIR', folder: string): string => {
  const override = process.env[envVar]
  return override ? path.resolve(override) : path.resolve(appRoot, 'public', folder)
}
