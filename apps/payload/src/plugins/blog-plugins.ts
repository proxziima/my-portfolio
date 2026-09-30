import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { searchPlugin } from '@payloadcms/plugin-search'
import type { BeforeSync } from '@payloadcms/plugin-search/types'
import { seoPlugin } from '@payloadcms/plugin-seo'
import type { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import type { Post } from '@repo/cms-types'
import type { Field, Plugin } from 'payload'
import { relationIds } from '../fields/relation-ids'
import { blogPostUrl, categoryPath, seoTitle } from './blog-urls'

const generateTitle: GenerateTitle<Post> = async ({ doc, req }) => {
  const profile = await req.payload.findGlobal({ slug: 'profile', depth: 0, req }).catch(() => null)
  return seoTitle(doc?.title, profile?.name)
}

const generateURL: GenerateURL<Post> = ({ doc }) => blogPostUrl(process.env.WEB_URL, doc?.slug)

const searchFields: Field[] = [
  { name: 'slug', type: 'text', index: true, admin: { readOnly: true } },
  { name: 'excerpt', type: 'textarea', admin: { readOnly: true } },
  { name: 'categories', type: 'array', admin: { readOnly: true }, fields: [{ name: 'title', type: 'text' }] },
]

const beforeSync: BeforeSync = async ({ originalDoc, req, searchDoc }) => {
  const ids = relationIds(originalDoc.categories)
  const { docs } = ids.length
    ? await req.payload.find({
        collection: 'categories',
        where: { id: { in: ids } },
        select: { title: true },
        depth: 0,
        pagination: false,
        req,
      })
    : { docs: [] }
  return {
    ...searchDoc,
    slug: originalDoc.slug,
    excerpt: originalDoc.excerpt,
    categories: docs.map(({ title }) => ({ title })),
  }
}

export const blogPlugins: Plugin[] = [
  nestedDocsPlugin({
    collections: ['categories'],
    generateLabel: (_docs, doc) => String(doc.title ?? ''),
    generateURL: (docs) => categoryPath(docs),
  }),
  seoPlugin({
    collections: ['posts'],
    uploadsCollection: 'media',
    tabbedUI: true,
    generateTitle,
    generateURL,
  }),
  searchPlugin({
    collections: ['posts'],
    defaultPriorities: { posts: 10 },
    beforeSync,
    searchOverrides: { fields: ({ defaultFields }) => [...defaultFields, ...searchFields] },
  }),
  redirectsPlugin({ collections: ['posts'] }),
]
