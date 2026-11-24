import { useEffect, useRef } from 'react'

// Sits after the last message of a conversation and reports once when it
// scrolls into view, so "read" means the player actually reached the end.
// Remount it (with a key) to report again for a different conversation.
export function ReadMarker({ onRead }: { onRead?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const reported = useRef(false)
  const latest = useRef(onRead)
  useEffect(() => {
    latest.current = onRead
  })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const report = () => {
      if (reported.current) return
      reported.current = true
      latest.current?.()
    }
    if (typeof IntersectionObserver === 'undefined') {
      report()
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        report()
        observer.disconnect()
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="read-marker" aria-hidden="true" />
}
