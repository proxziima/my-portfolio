import Link from 'next/link'

export const metadata = { title: 'Not found', robots: { index: false } }

/** A letter-styled 404 for `notFound()` inside the site group; unmatched URLs use `app/global-not-found.tsx`. */
export default function NotFound() {
  return (
    <main>
      <h1><span className="who">Nothing here.</span></h1>
      <p>
        This page doesn&rsquo;t exist. <Link href="/">Back to the letter</Link>
      </p>
    </main>
  )
}
