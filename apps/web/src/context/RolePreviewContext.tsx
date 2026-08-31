import { useMemo, useState, type ReactNode } from 'react'
import type { RoleId } from '../types/navigation'
import { RolePreviewContext } from './rolePreviewContextValue'

export function RolePreviewProvider({
  children,
  initialRole = 'worker',
}: {
  readonly children: ReactNode
  readonly initialRole?: RoleId
}) {
  const [role, setRole] = useState<RoleId>(initialRole)
  const value = useMemo(() => ({ role, setRole }), [role])

  return (
    <RolePreviewContext.Provider value={value}>
      {children}
    </RolePreviewContext.Provider>
  )
}
