import { useEffect } from 'react'
import { useMatches } from 'react-router-dom'

export const defaultDocumentTitle = 'Ajani Workforce | Healthcare workforce operations'

interface RouteHandle {
  readonly title?: string
}

function handleTitle(handle: unknown): string | undefined {
  const title = (handle as RouteHandle | undefined)?.title
  return typeof title === 'string' ? title : undefined
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}

export function useRouteDocumentTitle(): void {
  const matches = useMatches()
  const title = matches
    .map((match) => handleTitle(match.handle))
    .reverse()
    .find((value): value is string => value !== undefined)
  useDocumentTitle(title ?? defaultDocumentTitle)
}
