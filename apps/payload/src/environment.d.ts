declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      NEXT_PUBLIC_SERVER_URL: string
      WEB_URL?: string
      REVALIDATE_SECRET?: string
      CRON_SECRET?: string
      PREVIEW_SECRET?: string
      /** Bearer secret the web BFF presents to GET /api/twin/redact-terms. */
      TWIN_REDACT_SECRET?: string
      /** Parent domain for the admin cookie in production, e.g. `.example.com`. */
      COOKIE_DOMAIN?: string
      /** Upload directories; default to `public/media`, `public/scenes` and `public/favicons` in the app. */
      MEDIA_DIR?: string
      SCENES_DIR?: string
      FAVICONS_DIR?: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
