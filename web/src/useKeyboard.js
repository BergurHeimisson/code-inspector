import { useEffect, useRef } from 'react'

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useKeyboard(handlers) {
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (FORM_TAGS.has(event.target?.tagName)) return

      const handler = latest.current[event.key]
      if (!handler) return

      event.preventDefault()
      handler()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
