import type { PostView } from '@/lib/cms/types'
import { PostBody } from './PostBody'
import styles from './PostArticle.module.css'

const DATE = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' })

function PostMeta({ post }: { post: PostView }) {
  const parts = [
    post.publishedAt ? DATE.format(new Date(post.publishedAt)) : 'Not published yet',
    post.authors.join(', '),
  ].filter(Boolean)
  return <p className={styles.meta}>{parts.join(' · ')}</p>
}

export function PostArticle({ post }: { post: PostView }) {
  return (
    <article>
      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        <PostMeta post={post} />
        {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}
      </header>
      {post.heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- preview surface, the CMS host varies
        <img className={styles.hero} src={post.heroImage.url} alt={post.heroImage.alt} />
      ) : null}
      <PostBody content={post.content} />
    </article>
  )
}
