import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppShell, NAV_ITEMS } from '../components/layout/AppShell'
import { ErrorBoundary } from '../components/ErrorBoundary'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAppRoute = NAV_ITEMS.some((item) => pathname.startsWith(item.to))

  return (
    <>
      {isAppRoute ? (
        <AppShell>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </AppShell>
      ) : (
        <div className="min-h-screen bg-gray-50">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      )}

      {/* Development Tools - Only visible in development */}
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools />
    </>
  )
}
