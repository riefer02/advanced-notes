import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useTodos, useCreateTodo } from '../hooks/useTodos'
import TodoList from '../components/TodoList'
import type { Todo } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const createTodo = useCreateTodo()

  // Fetch todos based on active tab
  const statusFilter = activeTab === 'all' ? undefined : activeTab
  const { data, isLoading, error } = useTodos({ status: statusFilter })

  const handleCreateTodo = async () => {
    const title = newTodoTitle.trim()
    if (!title) return

    try {
      await createTodo.mutateAsync({ title })
      setNewTodoTitle('')
      setIsCreating(false)
    } catch (error) {
      console.error('Failed to create todo:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreateTodo()
    }
    if (e.key === 'Escape') {
      setIsCreating(false)
      setNewTodoTitle('')
    }
  }

  // Filter todos for display
  const todos = data?.todos || []
  const suggestedTodos = todos.filter((t: Todo) => t.status === 'suggested')
  const activeTodos =
    activeTab === 'all'
      ? todos.filter((t: Todo) => t.status === 'accepted')
      : todos.filter((t: Todo) => t.status === 'completed')

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
              onKeyDown={handleKeyDown}
              placeholder="What needs to be done?"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false)
                  setNewTodoTitle('')
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateTodo}
                disabled={!newTodoTitle.trim()}
                loading={createTodo.isPending}
              >
                Add todo
              </Button>
            </div>
          </DetailCard>
        )}

        {suggestedTodos.length > 0 && activeTab === 'all' && (
          <Callout
            tone="warning"
            label={`Suggested todos · ${suggestedTodos.length}`}
            className="space-y-2"
          >
            <p className="text-xs leading-5 text-warning/90">
              Extracted from your voice notes. Accept one to add it to your list.
            </p>
            <TodoList todos={suggestedTodos} showNoteLinks />
          </Callout>
        )}

        <div className="flex items-center justify-between gap-3">
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
        </div>

        {isLoading ? (
          <div className="text-ink-subtle py-10 text-center text-sm">Loading todos…</div>
        ) : error ? (
          <div className="text-destructive py-10 text-center text-sm">Failed to load todos</div>
        ) : (
          <TodoList
            todos={activeTodos}
            emptyMessage={
              activeTab === 'completed'
                ? 'No completed todos yet.'
                : 'No active todos. Create one to get started.'
            }
            showNoteLinks
          />
        )}
      </div>
    </div>
  )
}
