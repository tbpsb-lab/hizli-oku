'use client'

import { useCallback, useRef, useState } from 'react'

export function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height)
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])

  return [ref, height] as const
}
