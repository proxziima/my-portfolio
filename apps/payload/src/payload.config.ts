import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { canRunJobs } from './access/run-jobs'
import { Categories } from './collections/Categories'
import { Content } from './collections/Content'
import { Disciplines } from './collections/Disciplines'
import { Experiences } from './collections/Experiences'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Projects } from './collections/Projects'
import { Scenes } from './collections/Scenes'
import { Users } from './collections/Users'
import { Contact } from './globals/Contact'
import { Navigation } from './globals/Navigation'
import { Profile } from './globals/Profile'
import { SiteSettings } from './globals/SiteSettings'
import { portfolioMcp } from './mcp/mcp-plugin'
import { blogPlugins } from './plugins/blog-plugins'
import { livePreviewBreakpoints } from './plugins/preview-url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    // Shared by every collection that sets `admin.livePreview.url` (today: posts).
    livePreview: { breakpoints: livePreviewBreakpoints },
  },
  collections: [Disciplines, Experiences, Projects, Content, Posts, Categories, Media, Scenes, Users],
  globals: [Profile, Contact, Navigation, SiteSettings],
  // The web origin loads uploads (the Spline scene) from the browser, so file responses need CORS.
  cors: process.env.WEB_URL ? [process.env.WEB_URL] : [],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? '' } }),
  editor: lexicalEditor(),
  // Runs the queue that scheduled publishing writes to. Needs a long-running server (not serverless).
  jobs: { autoRun: [{ cron: '* * * * *', queue: 'default' }], access: { run: canRunJobs } },
  plugins: [...blogPlugins, portfolioMcp],
  secret: process.env.PAYLOAD_SECRET ?? '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, '../../../packages/cms-types/src/payload-types.ts'),
    declare: false,
  },
})
