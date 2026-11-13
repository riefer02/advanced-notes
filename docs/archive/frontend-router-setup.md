# Frontend Router Setup with TanStack Router

## Overview

The frontend now uses **TanStack Router** for routing, which provides:

- 🤖 **100% TypeScript Support** - Fully type-safe routing
- 🔄 **React Query Integration** - Seamless integration with TanStack Query
- 📁 **File-based Routing** - Automatic route generation from file structure
- ⚡ **Code Splitting** - Automatic per-route code splitting
- 🎯 **Search Params API** - First-class URL search parameter support
- 🛠️ **Vite Plugin** - Excellent Vite integration

## Installation

The following packages have been installed:

```bash
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin
```

## Configuration

### Vite Configuration

The Vite config (`vite.config.ts`) has been updated to include the TanStack Router plugin:

```typescript
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(), // Must come after tanstackRouter
  ],
})
```

## File Structure

```
frontend/src/
├── routes/
│   ├── __root.tsx        # Root layout with React Query integration
│   └── index.tsx         # Home page route (/)
├── routeTree.gen.ts      # Auto-generated (do not edit)
└── main.tsx              # App entry point with RouterProvider
```

## How Routes Work

### Root Route (`__root.tsx`)

The root route wraps all pages and provides:
- React Query context via `QueryClient`
- Development tools (Router DevTools & React Query DevTools)
- Global layout structure

### File-based Routing

Routes are automatically generated based on the file structure in `src/routes/`:

| File Path | URL Route | Description |
|-----------|-----------|-------------|
| `index.tsx` | `/` | Home page |
| `about.tsx` | `/about` | About page |
| `notes/$noteId.tsx` | `/notes/:noteId` | Dynamic note detail page |
| `notes/index.tsx` | `/notes` | Notes list page |

## Adding New Routes

### Simple Route

Create a new file in `src/routes/`:

```typescript
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">About</h1>
      <p>About this application...</p>
    </div>
  )
}
```

### Route with Data Loading (React Query Integration)

```typescript
// src/routes/notes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { fetchNotes } from '../lib/api'

// Define query options
const notesQueryOptions = queryOptions({
  queryKey: ['notes'],
  queryFn: fetchNotes,
})

export const Route = createFileRoute('/notes/')({
  // Preload data before rendering
  loader: ({ context }) => 
    context.queryClient.ensureQueryData(notesQueryOptions),
  component: NotesPage,
})

function NotesPage() {
  // Read data from cache (already loaded by loader)
  const { data: notes } = useSuspenseQuery(notesQueryOptions)
  
  return (
    <div>
      {notes.map(note => (
        <div key={note.id}>{note.title}</div>
      ))}
    </div>
  )
}
```

### Dynamic Route

```typescript
// src/routes/notes/$noteId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { fetchNote } from '../../lib/api'

const noteQueryOptions = (noteId: string) => queryOptions({
  queryKey: ['notes', noteId],
  queryFn: () => fetchNote(noteId),
})

export const Route = createFileRoute('/notes/$noteId')({
  loader: ({ context, params }) => 
    context.queryClient.ensureQueryData(noteQueryOptions(params.noteId)),
  component: NoteDetailPage,
})

function NoteDetailPage() {
  const { noteId } = Route.useParams()
  const { data: note } = useSuspenseQuery(noteQueryOptions(noteId))
  
  return (
    <div>
      <h1>{note.title}</h1>
      <p>{note.content}</p>
    </div>
  )
}
```

## Navigation

### Using Link Component

```typescript
import { Link } from '@tanstack/react-router'

function Navigation() {
  return (
    <nav>
      <Link to="/" className="[&.active]:font-bold">
        Home
      </Link>
      <Link to="/about" className="[&.active]:font-bold">
        About
      </Link>
      <Link to="/notes" className="[&.active]:font-bold">
        Notes
      </Link>
    </nav>
  )
}
```

### Programmatic Navigation

```typescript
import { useNavigate } from '@tanstack/react-router'

function MyComponent() {
  const navigate = useNavigate()
  
  const handleClick = () => {
    navigate({ to: '/notes' })
  }
  
  return <button onClick={handleClick}>Go to Notes</button>
}
```

### Navigation with Search Params

```typescript
import { Link } from '@tanstack/react-router'

<Link 
  to="/search" 
  search={{ query: 'hello', page: 1 }}
>
  Search
</Link>
```

## Development Tools

When running `npm run dev`, you'll see:

1. **TanStack Router DevTools** - Bottom right corner showing:
   - Current route
   - Route tree structure
   - Route parameters
   - Search params

2. **React Query DevTools** - Bottom left corner showing:
   - Active queries
   - Query cache
   - Query state

## Type Safety

TanStack Router provides full TypeScript support:

```typescript
// Route parameters are typed
const { noteId } = Route.useParams() // noteId is string

// Search params can be validated with Zod
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().optional(),
  page: z.number().default(1),
})

export const Route = createFileRoute('/search')({
  validateSearch: searchSchema,
  component: SearchPage,
})

function SearchPage() {
  const search = Route.useSearch() // Fully typed!
  // search.query is string | undefined
  // search.page is number
}
```

## Best Practices

1. **Use `useSuspenseQuery` in components** - It works best with TanStack Router's loader pattern
2. **Preload data in loaders** - Use `context.queryClient.ensureQueryData()` for critical data
3. **Use `defaultPreload: 'intent'`** - Preloads routes on hover/focus for better UX
4. **Organize routes logically** - Use folders for nested routes
5. **Keep route components small** - Extract complex logic to separate components

## Future Enhancements

Potential features to explore:

- [ ] Add search params validation with Zod
- [ ] Implement nested layouts
- [ ] Add route guards for authentication
- [ ] Set up error boundaries per route
- [ ] Add loading states with `pendingComponent`
- [ ] Implement route-level error handling

## Resources

- [TanStack Router Docs](https://tanstack.com/router)
- [TanStack Query Integration](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading)
- [File-based Routing Guide](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)

