import {
  Component,
  Suspense,
  lazy,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'
import './App.css'
import { createAjaniQueryClient } from './api/queryClient'
import { AppShell } from './components/AppShell'
import { NotificationSessionProvider } from './context/NotificationSessionContext'
import { RolePreviewProvider } from './context/RolePreviewContext'
import type { RoleId } from './types/navigation'
import {
  AdministratorRecordsPage,
  FoundationPage,
  ManagerCoveragePage,
  ManagerOperationsPage,
  NotFoundPage,
  NotificationsPage,
  RouteErrorPage,
  WorkerOverviewPage,
  WorkerReadinessPage,
} from './pages/ProductPages'

function lazyNamedPage<TModule>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule,
) {
  return lazy(async () => {
    const loadedModule = await loader()
    return { default: loadedModule[exportName] as ComponentType }
  })
}

const loadLandingPage = () => import('./pages/LandingPage')
const LandingPage = lazyNamedPage(loadLandingPage, 'LandingPage')

const loadWorkerShiftPages = () => import('./pages/WorkerShiftPages')
const WorkerSchedulePage = lazyNamedPage(loadWorkerShiftPages, 'WorkerSchedulePage')
const WorkerShiftDetailPage = lazyNamedPage(
  loadWorkerShiftPages,
  'WorkerShiftDetailPage',
)
const WorkerShiftsPage = lazyNamedPage(loadWorkerShiftPages, 'WorkerShiftsPage')

const loadOperationalPages = () => import('./pages/OperationsPages')
const AdministratorComplianceDetailPage = lazyNamedPage(
  loadOperationalPages,
  'AdministratorComplianceDetailPage',
)
const AdministratorComplianceReviewPage = lazyNamedPage(
  loadOperationalPages,
  'AdministratorComplianceReviewPage',
)
const AdministratorTimesheetsPage = lazyNamedPage(
  loadOperationalPages,
  'AdministratorTimesheetsPage',
)
const ManagerAssignmentRequestsPage = lazyNamedPage(
  loadOperationalPages,
  'ManagerAssignmentRequestsPage',
)
const ManagerShiftCreatePage = lazyNamedPage(
  loadOperationalPages,
  'ManagerShiftCreatePage',
)
const ManagerShiftDetailPage = lazyNamedPage(
  loadOperationalPages,
  'ManagerShiftDetailPage',
)
const ManagerShiftsPage = lazyNamedPage(loadOperationalPages, 'ManagerShiftsPage')
const ManagerTimesheetsPage = lazyNamedPage(
  loadOperationalPages,
  'ManagerTimesheetsPage',
)
const WorkerTimesheetDetailPage = lazyNamedPage(
  loadOperationalPages,
  'WorkerTimesheetDetailPage',
)
const WorkerTimesheetsPage = lazyNamedPage(
  loadOperationalPages,
  'WorkerTimesheetsPage',
)

function RouteLoadingState() {
  return (
    <section aria-busy="true" aria-live="polite" className="card route-loading">
      <p className="overline">Loading workspace</p>
      <h1>Preparing this preview route</h1>
      <span role="status">Loading synthetic preview content</span>
    </section>
  )
}

function lazyRoute(page: ReactNode): ReactNode {
  return <Suspense fallback={<RouteLoadingState />}>{page}</Suspense>
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: lazyRoute(<LandingPage />),
    errorElement: <RouteErrorPage />,
    handle: { title: 'Ajani Workforce | Healthcare workforce operations' },
  },
  {
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <></>,
    children: [
      {
        path: 'worker/overview',
        element: <WorkerOverviewPage />,
        handle: { title: 'Worker overview | Ajani Workforce' },
      },
      {
        path: 'worker/shifts',
        element: lazyRoute(<WorkerShiftsPage />),
        handle: { title: 'Find shifts | Ajani Workforce' },
      },
      {
        path: 'worker/shifts/:shiftId',
        element: lazyRoute(<WorkerShiftDetailPage />),
        handle: { title: 'Shift details | Ajani Workforce' },
      },
      {
        path: 'worker/schedule',
        element: lazyRoute(<WorkerSchedulePage />),
        handle: { title: 'My schedule | Ajani Workforce' },
      },
      {
        path: 'worker/timesheets',
        element: lazyRoute(<WorkerTimesheetsPage />),
        handle: { title: 'My timesheets | Ajani Workforce' },
      },
      {
        path: 'worker/timesheets/:timesheetId',
        element: lazyRoute(<WorkerTimesheetDetailPage />),
        handle: { title: 'Timesheet details | Ajani Workforce' },
      },
      {
        path: 'worker/readiness',
        element: <WorkerReadinessPage />,
        handle: { title: 'Work readiness | Ajani Workforce' },
      },
      {
        path: 'manager/operations',
        element: <ManagerOperationsPage />,
        handle: { title: 'Manager operations | Ajani Workforce' },
      },
      {
        path: 'manager/coverage',
        element: <ManagerCoveragePage />,
        handle: { title: 'Coverage needs | Ajani Workforce' },
      },
      {
        path: 'manager/requests',
        element: lazyRoute(<ManagerAssignmentRequestsPage />),
        handle: { title: 'Assignment requests | Ajani Workforce' },
      },
      {
        path: 'manager/shifts',
        element: lazyRoute(<ManagerShiftsPage />),
        handle: { title: 'Manage shifts | Ajani Workforce' },
      },
      {
        path: 'manager/shifts/new',
        element: lazyRoute(<ManagerShiftCreatePage />),
        handle: { title: 'Create shift | Ajani Workforce' },
      },
      {
        path: 'manager/shifts/:shiftId',
        element: lazyRoute(<ManagerShiftDetailPage />),
        handle: { title: 'Shift details | Ajani Workforce' },
      },
      {
        path: 'manager/timesheets',
        element: lazyRoute(<ManagerTimesheetsPage />),
        handle: { title: 'Timesheet approvals | Ajani Workforce' },
      },
      {
        path: 'administrator/compliance',
        element: lazyRoute(<AdministratorComplianceReviewPage />),
        handle: { title: 'Compliance review | Ajani Workforce' },
      },
      {
        path: 'administrator/compliance/:recordId',
        element: lazyRoute(<AdministratorComplianceDetailPage />),
        handle: { title: 'Compliance record | Ajani Workforce' },
      },
      {
        path: 'administrator/timesheets',
        element: lazyRoute(<AdministratorTimesheetsPage />),
        handle: { title: 'Timesheet oversight | Ajani Workforce' },
      },
      {
        path: 'administrator/records',
        element: <AdministratorRecordsPage />,
        handle: { title: 'Workforce records | Ajani Workforce' },
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
        handle: { title: 'Notifications | Ajani Workforce' },
      },
      {
        path: 'foundation',
        element: <FoundationPage />,
        handle: { title: 'Product foundation | Ajani Workforce' },
      },
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { title: 'Page not found | Ajani Workforce' },
      },
    ],
  },
]

interface ApplicationErrorBoundaryState {
  readonly hasError: boolean
}

class ApplicationErrorBoundary extends Component<
  { readonly children: ReactNode },
  ApplicationErrorBoundaryState
> {
  public override state: ApplicationErrorBoundaryState = { hasError: false }

  public static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { hasError: true }
  }

  public override componentDidCatch(): void {
    // Deliberately avoids logging potentially sensitive runtime details.
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fatal-error" role="alert">
          <p className="overline">Application error</p>
          <h1>Ajani Workforce could not display this preview.</h1>
          <p>Reload the page to recover. No workforce data has been changed.</p>
          <button
            className="button button--primary"
            onClick={() => {
              window.location.reload()
            }}
            type="button"
          >
            Reload application
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export interface AppProps {
  readonly initialEntries?: readonly string[]
}

function roleFromPath(path: string): RoleId {
  if (path.startsWith('/manager/')) {
    return 'manager'
  }
  if (path.startsWith('/administrator/')) {
    return 'administrator'
  }
  return 'worker'
}

function App({ initialEntries }: AppProps) {
  const initialPath = initialEntries?.[0] ?? window.location.pathname
  const [queryClient] = useState(createAjaniQueryClient)
  const [router] = useState(() =>
    initialEntries === undefined
      ? createBrowserRouter(routes)
      : createMemoryRouter(routes, { initialEntries: [...initialEntries] }),
  )

  return (
    <ApplicationErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <NotificationSessionProvider>
          <RolePreviewProvider initialRole={roleFromPath(initialPath)}>
            <RouterProvider router={router} />
          </RolePreviewProvider>
        </NotificationSessionProvider>
      </QueryClientProvider>
    </ApplicationErrorBoundary>
  )
}

export default App
