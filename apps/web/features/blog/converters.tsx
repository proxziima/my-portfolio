import type { BannerBlock, CodeBlock, Media, MediaBlock } from '@repo/cms-types'
import type { DefaultNodeTypes, SerializedBlockNode, SerializedLinkNode } from '@payloadcms/richtext-lexical'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import type { ReactNode } from 'react'
import { mediaUrl } from '@/lib/cms/mappers'
import { safeHref } from '@/shared/ui/chip-markup'
import styles from './PostBody.module.css'

type NodeTypes = DefaultNodeTypes | SerializedBlockNode<CodeBlock | BannerBlock | MediaBlock>
type LinkFields = SerializedLinkNode['fields']

/** Internal links go to the post's blog path; custom URLs must pass `safeHref`. */
export function linkHref(fields: LinkFields): string | undefined {
  if (fields.linkType === 'internal') {
    const value = fields.doc?.value
    const slug = value && typeof value === 'object' ? value.slug : undefined
    return typeof slug === 'string' && slug ? `/blog/${encodeURIComponent(slug)}` : undefined
  }
  return safeHref(fields.url)
}

const asMedia = (value: unknown): Media | null =>
  value && typeof value === 'object' && 'url' in value ? (value as Media) : null

function MediaFigure({ media, base }: { media: Media | null; base: string }): ReactNode {
  const src = mediaUrl(media, base)
  if (!media || !src) return null
  if (!media.mimeType?.startsWith('image/')) return <a href={src}>{media.filename ?? media.alt}</a>
  return (
    <figure className={styles.figure}>
      {/* A preview surface fed by any CMS host: next/image would need remotePatterns for each one. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={media.alt} width={media.width ?? undefined} height={media.height ?? undefined} loading="lazy" />
    </figure>
  )
}

function renderLink(fields: LinkFields, children: ReactNode): ReactNode {
  const href = linkHref(fields)
  if (!href) return <>{children}</>
  const external = fields.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return <a href={href} {...external}>{children}</a>
}

// A function declaration so the banner can nest the same converters, built lazily at render time.
export function postConverters(base: string): JSXConvertersFunction<NodeTypes> {
  return ({ defaultConverters }) => ({
    ...defaultConverters,
    link: ({ node, nodesToJSX }) => renderLink(node.fields, nodesToJSX({ nodes: node.children })),
    autolink: ({ node, nodesToJSX }) => renderLink(node.fields, nodesToJSX({ nodes: node.children })),
    upload: ({ node }) => <MediaFigure media={asMedia(node.value)} base={base} />,
    blocks: {
      code: ({ node }) => (
        <pre className={styles.code} data-language={node.fields.language}>
          <code>{node.fields.code}</code>
        </pre>
      ),
      banner: ({ node }) => (
        <aside className={styles.banner} data-style={node.fields.style}>
          <RichText data={node.fields.content} converters={postConverters(base)} disableContainer />
        </aside>
      ),
      mediaBlock: ({ node }) => <MediaFigure media={asMedia(node.fields.media)} base={base} />,
    },
  })
}
