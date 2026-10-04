'use client'
import { useCallback, useRef, useState } from 'react'
import { typingDelay, type Message, type Responder, type Sender } from './responder'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A chat with one contact: the messages so far, whether the contact is typing, and `send`. */
export function useConversation(respond: Responder) {
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [typing, setTyping] = useState(false)
  // refs: a reply in flight must see every message sent meanwhile, whatever React has rendered
  const history = useRef<readonly Message[]>([])
  const nextId = useRef(0)
  const pending = useRef(0)
  // replies are produced one at a time, so they arrive in the order the messages were sent
  const queue = useRef<Promise<void>>(Promise.resolve())

  const append = useCallback((from: Sender, text: string) => {
    history.current = [...history.current, { id: nextId.current++, from, text }]
    setMessages(history.current)
  }, [])

  const send = useCallback(
    (input: string) => {
      const text = input.trim()
      if (!text) return Promise.resolve()
      append('viewer', text)
      pending.current += 1
      setTyping(true)
      const turn = queue.current.then(async () => {
        try {
          const reply = await respond(history.current)
          if (!reply) return
          await wait(typingDelay(reply))
          append('contact', reply)
        } finally {
          pending.current -= 1
          setTyping(pending.current > 0)
        }
      })
      // a failed turn must not block the ones after it; the caller still sees the rejection
      queue.current = turn.catch(() => {})
      return turn
    },
    [append, respond],
  )

  return { messages, typing, send }
}
