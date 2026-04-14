// ---------------------------------------------------------------------------
// `useScrollToBottom` — copied verbatim from Vercel's `ai-chatbot` template.
//
// Source:   https://github.com/vercel/ai-chatbot/blob/f9652b452a4dc006af947c29301f4845efec892a/hooks/use-scroll-to-bottom.tsx
// License:  Apache License 2.0 — Copyright 2024 Vercel, Inc.
//           https://github.com/vercel/ai-chatbot/blob/main/LICENSE
//
// Why this hook instead of rolling our own: it is the de-facto reference
// implementation for "stay pinned to the bottom of a streaming chat, land at
// the bottom on initial load, and re-pin whenever content grows". It combines
// a `MutationObserver` (catches DOM changes) with a `ResizeObserver` on the
// container *and every direct child* (catches late layout shifts from
// markdown rendering, syntax highlighting, image loads, streamed tokens), and
// runs the actual `scrollTo` inside `requestAnimationFrame` with
// `behavior: 'instant'`, which is what prevents the visible "jump" on reload.
//
// Kept verbatim (not refactored) so upstream improvements can be re-pulled
// cleanly — update the pinned commit SHA above if you re-sync.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react'

export function useScrollToBottom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const isUserScrollingRef = useRef(false)

  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) {
      return true
    }
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    return scrollTop + clientHeight >= scrollHeight - 100
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.current) {
      return
    }
    containerRef.current.scrollTo({
      behavior,
      top: containerRef.current.scrollHeight,
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let scrollTimeout: ReturnType<typeof setTimeout>

    const handleScroll = () => {
      isUserScrollingRef.current = true
      clearTimeout(scrollTimeout)

      const atBottom = checkIfAtBottom()
      setIsAtBottom(atBottom)
      isAtBottomRef.current = atBottom

      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 150)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [checkIfAtBottom])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      return
    }

    const scrollIfNeeded = () => {
      if (isAtBottomRef.current && !isUserScrollingRef.current) {
        requestAnimationFrame(() => {
          container.scrollTo({
            behavior: 'instant',
            top: container.scrollHeight,
          })
          setIsAtBottom(true)
          isAtBottomRef.current = true
        })
      }
    }

    const mutationObserver = new MutationObserver(scrollIfNeeded)
    mutationObserver.observe(container, {
      characterData: true,
      childList: true,
      subtree: true,
    })

    const resizeObserver = new ResizeObserver(scrollIfNeeded)
    resizeObserver.observe(container)

    for (const child of container.children) {
      resizeObserver.observe(child)
    }

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  function onViewportEnter() {
    setIsAtBottom(true)
    isAtBottomRef.current = true
  }

  function onViewportLeave() {
    setIsAtBottom(false)
    isAtBottomRef.current = false
  }

  const reset = useCallback(() => {
    setIsAtBottom(true)
    isAtBottomRef.current = true
    isUserScrollingRef.current = false
  }, [])

  return {
    containerRef,
    endRef,
    isAtBottom,
    onViewportEnter,
    onViewportLeave,
    reset,
    scrollToBottom,
  }
}
