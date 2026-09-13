import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * What a page puts in the app bar: its name, a one-line description, and
 * whatever actions belong next to them (an export menu, a "View reports"
 * link, a month picker — each page decides).
 *
 * The bar itself has no idea what a page is called; it only ever renders
 * whatever the current page last handed it, which is what lets every route
 * keep owning its own title instead of the shell maintaining a second copy.
 */
export interface PageHeaderContent {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/**
 * Two contexts, not one, and this split is load-bearing.
 *
 * `PageHeaderProvider` wraps both the app bar *and* the routed page content
 * (a page has to be able to reach the setter from somewhere above it). If a
 * page's own `setContent` call re-rendered that same page, its `usePageHeader`
 * effect — which has no dependency array on purpose, since a page's
 * title/actions are usually computed fresh each render — would fire again,
 * call `setContent` again, and loop forever.
 *
 * React's `useState` setter is referentially stable across renders, so a
 * context carrying *only* the setter never gives its consumers a reason to
 * re-render, no matter how often the content itself changes. The content
 * itself lives in a second context that only the app bar subscribes to.
 */
const SetPageHeaderContentContext = createContext<((content: PageHeaderContent) => void) | null>(null)
const PageHeaderContentContext = createContext<PageHeaderContent>({})

/** Wraps the shell once, above both the app bar and the routed page content, so both share one value. */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<PageHeaderContent>({})
  return (
    <SetPageHeaderContentContext.Provider value={setContent}>
      <PageHeaderContentContext.Provider value={content}>{children}</PageHeaderContentContext.Provider>
    </SetPageHeaderContentContext.Provider>
  )
}

/** Read-only side — the app bar itself. The only thing that re-renders when the content changes. */
export function usePageHeaderContent(): PageHeaderContent {
  return useContext(PageHeaderContentContext)
}

/**
 * Called from a page to publish its title/description/actions into the app
 * bar. Clears itself on unmount — so navigating away never leaves a stale
 * title sitting in the bar for the next page to inherit — which is why this
 * is a hook a page calls during render, not a prop threaded through the router.
 */
export function usePageHeader(content: PageHeaderContent): void {
  const setContent = useContext(SetPageHeaderContentContext)
  if (!setContent) throw new Error('usePageHeader must be used inside PageHeaderProvider')

  useEffect(() => {
    setContent(content)
    return () => setContent({})
    // Every page passes a fresh object each render (its title/description are
    // often computed inline), so this deliberately re-runs on every render
    // rather than chasing a stable dependency list. Safe to do unconditionally
    // *only* because `setContent` is read from a context that never changes
    // reference on its own (see the module doc comment) — otherwise this would
    // be the same render loop that split exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })
}
