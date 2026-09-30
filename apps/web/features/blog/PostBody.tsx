import { RichText } from '@payloadcms/richtext-lexical/react'
import { cmsBaseUrl } from '@/lib/cms/client'
import type { PostView } from '@/lib/cms/types'
import { postConverters } from './converters'
import styles from './PostBody.module.css'

/** Server-rendered Lexical content: only the markup reaches the browser, never the editor JSON. */
export function PostBody({ content }: { content: PostView['content'] }) {
  return <RichText data={content} converters={postConverters(cmsBaseUrl())} className={styles.body} />
}
