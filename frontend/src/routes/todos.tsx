import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Search } from 'lucide-react'
import { useTodos, useCreateTodo } from '../hooks/useTodos'
import TodoList from '../components/TodoList'
import type { Todo } from '../lib/api'
import { pluralize } from '../lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Callout, DetailCard } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'

export const Route = createFileRoute('/todos')({
  component: TodosPage,
})

type TabType = 'all' | 'accepted' | 'completed'

function TodosPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [query, setQuery] = useState('')
  const createTodo = useCreateTodo()

  // Fetch once so tab counts stay correct regardless of the selected tab.
  const { data, isLoading, error, refetch } = useTodos({})

  const resetForm = () => {
    setIsCreating(false)
    setNewTodoTitle('')
    setNewTodoDescription('')
    createTodo.reset()
  }

  const handleCreateTodo = async () => {
    const title = newTodoTitle.trim()
    if (!title) return

    try {
      await createTodo.mutateAsync({
        title,
        description: newTodoDescription.trim() || undefined,
      })
      setNewTodoTitle('')
      setNewTodoDescription('')
      setIsCreating(false)
    } catch (error) {
      console.error('Failed to create todo:', error)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleCreateTodo()
    }
    if (e.key === 'Escape') {
      resetForm()
    }
  }

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleCreateTodo()
    }
    if (e.key === 'Escape') {
      resetForm()
    }
  }

  // Filter todos for display
  const todos = useMemo(() => data?.todos ?? [], [data?.todos])
  const suggestedTodos = todos.filter((t: Todo) => t.status === 'suggested')
  const activeTodos =
    activeTab === 'all'
      ? todos.filter((t: Todo) => t.status === 'accepted')
      : todos.filter((t: Todo) => t.status === 'completed')

  const normalizedQuery = query.trim().toLowerCase()
  const matchesQuery = (todo: Todo) =>
    !normalizedQuery ||
    todo.title.toLowerCase().includes(normalizedQuery) ||
    (todo.description ?? '').toLowerCase().includes(normalizedQuery)

  const visibleTodos = activeTodos.filter(matchesQuery)
  const visibleSuggested = suggestedTodos.filter(matchesQuery)

  const tabs: { key: TabType; label: string; count?: number }[] = [
    {
      key: 'all',
      label: 'Active',
      count: todos.filter((t: Todo) => t.status !== 'suggested' && t.status !== 'completed').length,
    },
    {
      key: 'completed',
      label: 'Completed',
      count: todos.filter((t: Todo) => t.status === 'completed').length,
    },
  ]

  const countLabel = normalizedQuery
    ? `Showing ${visibleTodos.length} of ${activeTodos.length} ${activeTodos.length === 1 ? 'todo' : 'todos'}`
    : `Showing ${pluralize(visibleTodos.length, 'todo')}`

  const emptyMessage = normalizedQuery
    ? `No todos match “${query.trim()}”. Clear the search to see everything.`
    : activeTab === 'completed'
      ? 'No completed todos yet. Complete an active todo to see it here.'
      : 'No active todos. Use New todo to add one, or accept a suggestion.'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-6 sm:px-8">
        <PageHeader
          title="Todos"
          description="Accept suggestions from your notes, or add your own."
          actions={
            !isCreating && (
              <Button size="sm" onClick={() => setIsCreating(true)}>
                <Plus />
                New todo
              </Button>
            )
          }
        />

        {isCreating && (
          <DetailCard className="space-y-2 p-3">
            <Input
              type="text"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="What needs to be done?"
              aria-label="Todo title"
              autoFocus
            />
            <Textarea
              value={newTodoDescription}
              onChange={(e) => setNewTodoDescription(e.target.value)}
              onKeyDown={handleDescriptionKeyDown}
              placeholder="Add details (optional)"
              aria-label="Todo description"
              rows={2}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-ink-subtle text-[11px]">
                <kbd className="font-sans">⌘/Ctrl + Enter</kbd> to add ·{' '}
                <kbd className="font-sans">Esc</kbd> to cancel
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleCreateTodo()}
                  disabled={!newTodoTitle.trim()}
                  loading={createTodo.isPending}
                >
                  Add todo
                </Button>
              </div>
            </div>
            {createTodo.isError && (
              <p className="text-destructive text-xs" role="status">
                {createTodo.error.message}
              </p>
            )}
          </DetailCard>
        )}

        {visibleSuggested.length > 0 && activeTab === 'all' && (
          <Callout
            tone="warning"
            label={`Suggested todos · ${visibleSuggested.length}`}
            className="space-y-2"
          >
            <p className="text-xs leading-5 text-warning/90">
              Extracted from your voice notes. Accept one to add it to your list, or dismiss it.
            </p>
            <TodoList todos={visibleSuggested} showNoteLinks />
          </Callout>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter todos by title or details..."
              aria-label="Filter todos"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
              <TabsList variant="line">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key}>
                    {tab.label}
                    {tab.count !== undefined && (
                      <Badge variant="neutral" className="ml-2 px-1.5 text-[10px] tabular-nums">
                        {tab.count}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {!isLoading && !error && (
              <p className="text-ink-subtle text-xs tabular-nums" aria-live="polite">
                {countLabel}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-ink-subtle py-10 text-center text-sm">Loading todos…</div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-destructive text-sm">Failed to load todos.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <TodoList todos={visibleTodos} emptyMessage={emptyMessage} showNoteLinks />
        )}
      </div>
    </div>
  )
}
