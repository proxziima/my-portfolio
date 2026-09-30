import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Content } from './collections/Content'
import { Disciplines } from './collections/Disciplines'
import { Experiences } from './collections/Experiences'
import { Media } from './collections/Media'
import { Projects } from './collections/Projects'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: dirname } },
  collections: [Disciplines, Experiences, Projects, Content, Media, Users],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? '' } }),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, '../../../packages/cms-types/src/payload-types.ts'),
    declare: false,
  },
})
