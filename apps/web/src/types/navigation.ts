import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  LayoutDashboard,
  Search,
  ShieldCheck,
  SquarePen,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'

export type RoleId = 'worker' | 'manager' | 'administrator'

export interface RoleDefinition {
  readonly id: RoleId
  readonly label: string
  readonly description: string
  readonly landingPath: string
}

export interface NavigationItem {
  readonly label: string
  readonly description: string
  readonly to: string
  readonly icon: LucideIcon
}

export const roleDefinitions: Record<RoleId, RoleDefinition> = {
  worker: {
    id: 'worker',
    label: 'Worker',
    description: 'Personal shifts and work-readiness preview',
    landingPath: '/worker/overview',
  },
  manager: {
    id: 'manager',
    label: 'Manager',
    description: 'Coverage and coordination preview',
    landingPath: '/manager/operations',
  },
  administrator: {
    id: 'administrator',
    label: 'Administrator',
    description: 'Compliance and workforce-record preview',
    landingPath: '/administrator/compliance',
  },
}

export const roleNavigation = {
  worker: [
    {
      label: 'Overview',
      description: 'Upcoming work and priorities',
      to: '/worker/overview',
      icon: LayoutDashboard,
    },
    {
      label: 'Find shifts',
      description: 'Browse matching opportunities',
      to: '/worker/shifts',
      icon: Search,
    },
    {
      label: 'My schedule',
      description: 'Assignments and requests',
      to: '/worker/schedule',
      icon: CalendarDays,
    },
    {
      label: 'My timesheets',
      description: 'Record and submit worked time',
      to: '/worker/timesheets',
      icon: FileClock,
    },
    {
      label: 'Readiness',
      description: 'Requirements and competency status',
      to: '/worker/readiness',
      icon: ClipboardCheck,
    },
    {
      label: 'Notifications',
      description: 'Updates requiring review',
      to: '/notifications',
      icon: Bell,
    },
  ],
  manager: [
    {
      label: 'Operations',
      description: 'Coverage at a glance',
      to: '/manager/operations',
      icon: LayoutDashboard,
    },
    {
      label: 'Coverage',
      description: 'Open needs and conflicts',
      to: '/manager/coverage',
      icon: UsersRound,
    },
    {
      label: 'Assignment requests',
      description: 'Approve or decline requests',
      to: '/manager/requests',
      icon: UserRoundCheck,
    },
    {
      label: 'Manage shifts',
      description: 'Create and maintain shifts',
      to: '/manager/shifts',
      icon: SquarePen,
    },
    {
      label: 'Timesheet approvals',
      description: 'Review submitted time',
      to: '/manager/timesheets',
      icon: FileClock,
    },
    {
      label: 'Notifications',
      description: 'Updates requiring review',
      to: '/notifications',
      icon: Bell,
    },
  ],
  administrator: [
    {
      label: 'Compliance',
      description: 'Readiness overview',
      to: '/administrator/compliance',
      icon: ShieldCheck,
    },
    {
      label: 'Workforce records',
      description: 'Synthetic record preview',
      to: '/administrator/records',
      icon: UserRoundCheck,
    },
    {
      label: 'Timesheet oversight',
      description: 'Monitor workflow status',
      to: '/administrator/timesheets',
      icon: FileClock,
    },
    {
      label: 'Notifications',
      description: 'Updates requiring review',
      to: '/notifications',
      icon: Bell,
    },
  ],
} as const satisfies Record<RoleId, readonly NavigationItem[]>

export const sharedNavigation = [
  {
    label: 'Product foundation',
    description: 'Direction and current boundaries',
    to: '/foundation',
    icon: FileCheck2,
  },
] as const satisfies readonly NavigationItem[]

export function isRoleId(value: string): value is RoleId {
  return value in roleDefinitions
}
