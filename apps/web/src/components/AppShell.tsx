import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Menu,
  UserRound,
} from 'lucide-react'
import { previewPersonaIds, type NotificationsResponse } from '@ajani/contracts'
import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  NavigationType,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom'
import { useNotificationsQuery, useRolePersonaQuery } from '../api/previewQueries'
import { useNotificationSession } from '../context/notificationSessionContextValue'
import { useRolePreview } from '../context/rolePreviewContextValue'
import { useRouteDocumentTitle } from '../hooks/useDocumentTitle'
import {
  roleDefinitions,
  roleNavigation,
  sharedNavigation,
  type NavigationItem,
  type RoleId,
} from '../types/navigation'
import { BrandMark } from './BrandMark'
import { NotificationList } from './NotificationList'
import { PreviewDataSource, PreviewQueryBoundary } from './PreviewQueryBoundary'
import { ServiceStatus } from './ServiceStatus'
import { Dialog } from './ui/Dialog'
import { EmptyState } from './ui/States'

const routeLabels: Record<string, readonly [string, string]> = {
  '/worker/overview': ['Worker', 'Overview'],
  '/worker/shifts': ['Worker', 'Find shifts'],
  '/worker/schedule': ['Worker', 'My schedule'],
  '/worker/timesheets': ['Worker', 'My timesheets'],
  '/worker/readiness': ['Worker', 'Readiness'],
  '/manager/operations': ['Manager', 'Operations'],
  '/manager/coverage': ['Manager', 'Coverage'],
  '/manager/requests': ['Manager', 'Assignment requests'],
  '/manager/shifts': ['Manager', 'Manage shifts'],
  '/manager/shifts/new': ['Manager', 'Create shift'],
  '/manager/timesheets': ['Manager', 'Timesheet approvals'],
  '/administrator/compliance': ['Administrator', 'Compliance'],
  '/administrator/timesheets': ['Administrator', 'Timesheet oversight'],
  '/administrator/records': ['Administrator', 'Workforce records'],
  '/notifications': ['Workspace', 'Notifications'],
  '/foundation': ['Ajani Workforce', 'Product foundation'],
}

function getApplicationScrollContainer(): Element {
  return document.scrollingElement ?? document.documentElement
}

function useRouteTransition(mainRef: RefObject<HTMLElement | null>): void {
  const location = useLocation()
  const navigationType = useNavigationType()
  const previousLocation = useRef({
    key: location.key,
    pathname: location.pathname,
  })
  const previousFocusPathname = useRef(location.pathname)
  const savedScrollPositions = useRef(new Map<string, number>())

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) {
      return undefined
    }

    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useLayoutEffect(() => {
    const previous = previousLocation.current

    if (previous.pathname === location.pathname) {
      previousLocation.current = {
        key: location.key,
        pathname: location.pathname,
      }
      return
    }

    const scrollContainer = getApplicationScrollContainer()
    savedScrollPositions.current.set(previous.key, scrollContainer.scrollTop)

    const destinationScrollTop =
      navigationType === NavigationType.Pop
        ? (savedScrollPositions.current.get(location.key) ?? 0)
        : 0

    scrollContainer.scrollLeft = 0
    scrollContainer.scrollTop = destinationScrollTop
    previousLocation.current = {
      key: location.key,
      pathname: location.pathname,
    }
  }, [location.key, location.pathname, navigationType])

  useEffect(() => {
    if (previousFocusPathname.current === location.pathname) {
      return
    }

    previousFocusPathname.current = location.pathname
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname, mainRef])
}

function ProductNavigation({ onNavigate }: { readonly onNavigate?: () => void }) {
  const { role } = useRolePreview()

  function renderItem(item: NavigationItem) {
    const Icon = item.icon
    return (
      <NavLink
        className={({ isActive }) => `product-nav__link${isActive ? ' is-active' : ''}`}
        end
        key={item.to}
        onClick={onNavigate}
        to={item.to}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
        <span>
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </span>
      </NavLink>
    )
  }

  return (
    <nav aria-label={`${roleDefinitions[role].label} preview navigation`} className="product-nav">
      <p className="product-nav__label">Workspace</p>
      {roleNavigation[role].map(renderItem)}
      <p className="product-nav__label product-nav__label--secondary">About</p>
      {sharedNavigation.map(renderItem)}
    </nav>
  )
}

function RolePreviewDialog({
  displayName,
  initials,
  onClose,
  open,
}: {
  readonly displayName: string
  readonly initials: string
  readonly onClose: () => void
  readonly open: boolean
}) {
  const { role, setRole } = useRolePreview()
  const [draftRole, setDraftRole] = useState<RoleId>(role)
  const navigate = useNavigate()

  function applyRole(): void {
    setRole(draftRole)
    onClose()
    void navigate(roleDefinitions[draftRole].landingPath)
  }

  return (
    <Dialog
      description="Change the product perspective shown in this browser. This is not sign-in or access control."
      onClose={onClose}
      open={open}
      title="Choose a role preview"
    >
      <div className="account-context">
        <span className="account-avatar" aria-hidden="true">{initials}</span>
        <div>
          <strong>{displayName}</strong>
          <span>Synthetic {roleDefinitions[role].label.toLowerCase()} persona</span>
        </div>
      </div>
      <fieldset className="role-options">
        <legend>Preview perspective</legend>
        {(Object.values(roleDefinitions)).map((definition) => (
          <label className="role-option" key={definition.id}>
            <input
              checked={draftRole === definition.id}
              name="role-preview"
              onChange={() => { setDraftRole(definition.id); }}
              type="radio"
              value={definition.id}
            />
            <span>
              <strong>{definition.label}</strong>
              <small>{definition.description}</small>
            </span>
            {draftRole === definition.id && <Check aria-hidden="true" size={18} />}
          </label>
        ))}
      </fieldset>
      <div className="dialog-actions">
        <button className="button button--secondary" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="button button--primary" onClick={applyRole} type="button">
          Apply preview
        </button>
      </div>
    </Dialog>
  )
}

function NotificationPanel({
  onClose,
  onMarkAllRead,
  open,
  query,
  recipientId,
  unreadCount,
}: {
  readonly onClose: () => void
  readonly onMarkAllRead: () => void
  readonly open: boolean
  readonly query: UseQueryResult<NotificationsResponse>
  readonly recipientId: string
  readonly unreadCount: number
}) {
  const { isNotificationRead } = useNotificationSession()

  return (
    <Dialog
      description={`${String(unreadCount)} unread preview updates.`}
      onClose={onClose}
      open={open}
      title="Notifications"
      variant="panel"
    >
      <div className="notification-panel__actions">
        <button
          className="text-button"
          disabled={unreadCount === 0 || query.isPending}
          onClick={onMarkAllRead}
          type="button"
        >
          Mark all as read
        </button>
      </div>
      <PreviewQueryBoundary query={query} skeletonLines={3}>
        {({ data, meta }) => {
          const unreadItems = data.items.filter(
            (notification) =>
              !isNotificationRead(recipientId, notification),
          )
          return (
            <>
              <PreviewDataSource generatedAt={meta.generatedAt} />
              {unreadItems.length === 0 ? (
              <EmptyState
                description="No unread synthetic updates remain for this role preview."
                title="No unread notifications"
              />
            ) : (
              <NotificationList
                items={unreadItems.slice(0, 3)}
                panel
                recipientId={recipientId}
              />
            )}
            </>
          )
        }}
      </PreviewQueryBoundary>
      <NavLink className="button button--secondary button--full" onClick={onClose} to="/notifications">
        View notification history
      </NavLink>
    </Dialog>
  )
}

export function AppShell() {
  useRouteDocumentTitle()
  const { role } = useRolePreview()
  const { isNotificationRead, markNotificationsRead } =
    useNotificationSession()
  const recipientId = previewPersonaIds[role]
  const personaQuery = useRolePersonaQuery(role)
  const notificationsQuery = useNotificationsQuery({
    cursor: undefined,
    role,
    unread: undefined,
  })
  const location = useLocation()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const currentLabels = routeLabels[location.pathname] ??
    (location.pathname.startsWith('/worker/shifts/')
      ? ['Worker', 'Shift details']
      : location.pathname.startsWith('/worker/timesheets/')
        ? ['Worker', 'Timesheet details']
        : location.pathname.startsWith('/manager/shifts/')
          ? ['Manager', 'Shift details']
          : location.pathname.startsWith('/administrator/compliance/')
            ? ['Administrator', 'Compliance record']
      : ['Ajani Workforce', 'Page'])
  const persona = personaQuery.data
  const displayName = persona?.displayName ?? `${roleDefinitions[role].label} preview`
  const personaInitials = persona?.displayName
      .split(' ')
      .map((part) => part[0])
      .filter((part): part is string => part !== undefined)
      .slice(0, 2)
      .join('')
  const initials =
    personaInitials === undefined || personaInitials.length === 0
      ? roleDefinitions[role].label.slice(0, 2).toUpperCase()
      : personaInitials
  const notificationItems = notificationsQuery.data?.data.items ?? []
  const unreadNotificationIds = notificationItems
    .filter((notification) => !isNotificationRead(recipientId, notification))
    .map((notification) => notification.id)
  const unreadCount = unreadNotificationIds.length

  useRouteTransition(mainRef)

  function markAllNotificationsRead(): void {
    markNotificationsRead(recipientId, unreadNotificationIds)
    setToastMessage('Notifications marked as read for this session')
    window.setTimeout(() => { setToastMessage(null); }, 4_000)
  }

  return (
    <div className="application-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="sidebar">
        <NavLink
          aria-label={`Ajani Workforce ${roleDefinitions[role].label.toLowerCase()} overview`}
          className="brand brand--sidebar"
          to={roleDefinitions[role].landingPath}
        >
          <BrandMark />
          <span className="brand__name">
            Ajani
            <small>Workforce</small>
          </span>
        </NavLink>
        <div className="preview-context">
          <p>Role preview</p>
          <strong>{roleDefinitions[role].label}</strong>
          <span>Not access control</span>
        </div>
        <ProductNavigation />
        <div className="sidebar__footnote">
          <BookOpen aria-hidden="true" size={17} />
          <span>An Ajani Healthcare product<br />Pre-production · Synthetic scenarios</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            aria-label="Open navigation menu"
            className="icon-button mobile-menu-button"
            onClick={() => { setMobileNavigationOpen(true); }}
            type="button"
          >
            <Menu aria-hidden="true" size={22} />
          </button>
          <div className="breadcrumbs" aria-label="Breadcrumb">
            <span>{currentLabels[0]}</span>
            <span aria-hidden="true">/</span>
            <strong>{currentLabels[1]}</strong>
          </div>
          <div className="topbar__actions">
            <button
              aria-label={`Open notifications, ${String(unreadCount)} unread`}
              className="icon-button notification-button"
              onClick={() => { setNotificationPanelOpen(true); }}
              type="button"
            >
              <Bell aria-hidden="true" size={20} />
              {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
            </button>
            <button className="account-button" onClick={() => { setRoleDialogOpen(true); }} type="button">
              <span className="account-avatar" aria-hidden="true">{initials}</span>
              <span>
                <strong>{displayName}</strong>
                <small>{roleDefinitions[role].label} preview</small>
              </span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          </div>
        </header>

        <ServiceStatus />

        <main className="main-content" id="main-content" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <Dialog
        description={`${roleDefinitions[role].label} workspace links. This menu does not change access.`}
        onClose={() => { setMobileNavigationOpen(false); }}
        open={mobileNavigationOpen}
        title="Navigation"
        variant="drawer"
      >
        <div className="mobile-preview-context">
          <span>Current role preview</span>
          <strong>{roleDefinitions[role].label}</strong>
        </div>
        <ProductNavigation onNavigate={() => { setMobileNavigationOpen(false); }} />
        <button className="button button--secondary button--full" onClick={() => {
          setMobileNavigationOpen(false)
          setRoleDialogOpen(true)
        }} type="button">
          <UserRound aria-hidden="true" size={18} />
          Change role preview
        </button>
      </Dialog>

      <RolePreviewDialog
        displayName={displayName}
        initials={initials}
        onClose={() => { setRoleDialogOpen(false); }}
        open={roleDialogOpen}
      />
      <NotificationPanel
        onClose={() => { setNotificationPanelOpen(false); }}
        onMarkAllRead={markAllNotificationsRead}
        open={notificationPanelOpen}
        query={notificationsQuery}
        recipientId={recipientId}
        unreadCount={unreadCount}
      />

      {toastMessage !== null && <div className="toast" role="status"><Check aria-hidden="true" size={19} />{toastMessage}</div>}
    </div>
  )
}
