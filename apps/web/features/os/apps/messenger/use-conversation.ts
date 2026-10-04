'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const append = useCallback((from: Sender, text: string) => {
    history.current = [...history.current, { id: nextId.current++, from, text }]
    setMessages(history.current)
  }, [])

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text) return
      append('viewer', text)
      pending.current += 1
      setTyping(true)
      try {
        const reply = await respond(history.current)
        await wait(typingDelay(reply))
        if (mounted.current && reply) append('contact', reply)
      } finally {
        pending.current -= 1
        if (mounted.current) setTyping(pending.current > 0)
      }
    },
    [append, respond],
  )

  return { messages, typing, send }
}
