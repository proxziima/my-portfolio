'use client'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { planMorph, renderParagraphs } from './morph/render'

// Layout effect: the non-animated hydrate path (Q4) must rewrite the DOM before first paint.

const SWAP_MS = 240
const STAGGER_MS = 9
const STAGGER_GROUP = 14

interface Options {
  animate: boolean
  reduce: boolean
  /** Called after every imperative rewrite of the bio DOM. */
  onRender: () => void
}

/**
 * Two-phase word morph, imperative on purpose: React never reconciles the spans.
 * Phase 1 fades out the words that leave; after SWAP_MS the new markup goes in with
 * the entering words hidden, and they are revealed on a staggered double rAF.
 */
export function useWordMorph(
  ref: RefObject<HTMLElement | null>,
  paragraphs: string[],
  { animate, reduce, onRender }: Options,
) {
  const shown = useRef(paragraphs)
  const pending = useRef<{ timer: number; paragraphs: string[] } | null>(null)
  // the swap fires later than the render that scheduled it: always call the latest callback
  const onRenderRef = useRef(onRender)
  useLayoutEffect(() => {
    onRenderRef.current = onRender
  }, [onRender])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shown.current === paragraphs) return
    const prev = shown.current
    shown.current = paragraphs
    // a new array with the same content (e.g. a refetch) is not a role change
    if (prev.join('\u0000') === paragraphs.join('\u0000')) return

    // a morph still in flight is flushed first, so fast switching never leaves a half-rewritten bio
    if (pending.current) {
      window.clearTimeout(pending.current.timer)
      el.innerHTML = renderParagraphs(pending.current.paragraphs)
      onRenderRef.current()
      pending.current = null
    }
    if (!animate || reduce) {
      el.innerHTML = renderParagraphs(paragraphs)
      onRenderRef.current()
      return
    }
    const plan = planMorph(prev, paragraphs)
    Array.from(el.children).forEach((p, k) => {
      p.querySelectorAll('.w').forEach((w, i) => {
        if (plan.leaving[k]?.has(i)) w.classList.add('out')
      })
    })
    const timer = window.setTimeout(() => {
      pending.current = null
      el.innerHTML = plan.nextHtml
      onRenderRef.current()
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.querySelectorAll<HTMLElement>('.w.in').forEach((w, i) => {
            w.style.transitionDelay = `${(i % STAGGER_GROUP) * STAGGER_MS}ms`
            w.classList.remove('in')
          })
        }),
      )
    }, SWAP_MS)
    pending.current = { timer, paragraphs }
  }, [ref, paragraphs, animate, reduce])

  useEffect(
    () => () => {
      if (pending.current) window.clearTimeout(pending.current.timer)
    },
    [],
  )
}
