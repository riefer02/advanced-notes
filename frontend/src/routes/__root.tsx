import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppShell } from '../components/layout/AppShell'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAppRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/summaries') ||
    pathname.startsWith('/notes') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/todos')

  return (
    <>
      {isAppRoute ? (
        <AppShell>
          <Outlet />
        </AppShell>
      ) : (
        <div className="min-h-screen bg-gray-50">
          <Outlet />
        </div>
      )}

      {/* Development Tools - Only visible in development */}
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools />
    </>
  )
}

