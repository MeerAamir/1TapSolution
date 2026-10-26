import { useEffect } from 'react'

/** Sets the tab title and mobile browser theme colour for public pages. */
export function usePageMeta(title?: string, themeColor?: string) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    if (meta && themeColor) meta.setAttribute('content', themeColor)
    return () => {
      document.title = previous
      if (meta && previousColor) meta.setAttribute('content', previousColor)
    }
  }, [title, themeColor])
}
