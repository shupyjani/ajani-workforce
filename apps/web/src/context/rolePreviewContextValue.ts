import { createContext, useContext } from 'react'
import type { RoleId } from '../types/navigation'

export interface RolePreviewContextValue {
  readonly role: RoleId
  readonly setRole: (role: RoleId) => void
}

export const RolePreviewContext = createContext<RolePreviewContextValue | null>(null)

export function useRolePreview(): RolePreviewContextValue {
  const context = useContext(RolePreviewContext)

  if (context === null) {
    throw new Error('Role preview context is unavailable')
  }

  return context
}
