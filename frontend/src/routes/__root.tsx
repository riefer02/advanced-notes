import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppShell, NAV_ITEMS } from '../components/layout/AppShell'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { RequireAuth } from '../components/RequireAuth'
import { OutageBanner } from '../components/OutageBanner'

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
          <RequireAuth>
            {/* Keying by pathname clears a crash when navigating elsewhere. */}
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </RequireAuth>
        </AppShell>
      ) : (
        <div className="min-h-screen bg-gray-50">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      )}

      <OutageBanner />

      {/* Development tools are excluded from production bundles. */}
      {import.meta.env.DEV && (
        <>
          <ReactQueryDevtools initialIsOpen={false} />
          <TanStackRouterDevtools />
        </>
      )}
    </>
  )
}
