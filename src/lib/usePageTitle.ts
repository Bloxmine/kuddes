import { useEffect } from 'react'
import { setBaseTitle } from './tabBadge'

/** The tab's title for this page; a count of new things may go in front of it (tabBadge.ts). */
export function usePageTitle(title: string) {
  useEffect(() => {
    setBaseTitle(title)
  }, [title])
}
