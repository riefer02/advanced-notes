import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useTodos, useCreateTodo } from '../hooks/useTodos'
import TodoList from '../components/TodoList'
import type { Todo } from '../lib/api'

export const Route = createFileRoute('/todos')({
  component: TodosPage,
})

type TabType = 'all' | 'accepted' | 'completed'

function TodosPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const createTodo = useCreateTodo()

  // Fetch todos based on active tab
  const statusFilter = activeTab === 'all' ? undefined : activeTab
  const { data, isLoading, error } = useTodos({ status: statusFilter })

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

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
    activeTab === 'all' ? todos.filter((t: Todo) => t.status !== 'suggested') : todos

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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Todos</h2>
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Todo
            </button>
          )}
        </div>

        {/* New Todo Form */}
        {isCreating && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <input
              type="text"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What needs to be done?"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewTodoTitle('')
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTodo}
                disabled={!newTodoTitle.trim() || createTodo.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createTodo.isPending ? 'Adding...' : 'Add Todo'}
              </button>
            </div>
          </div>
        )}

        {/* Suggested Todos Section */}
        {suggestedTodos.length > 0 && activeTab === 'all' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-sm font-semibold text-amber-900">
                Suggested Todos ({suggestedTodos.length})
              </h3>
            </div>
            <p className="text-sm text-amber-700 mb-3">
              These todos were extracted from your voice notes. Accept them to add to your list.
            </p>
            <TodoList todos={suggestedTodos} showNoteLinks />
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === tab.key
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Todo List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading todos...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">Failed to load todos</div>
        ) : (
          <TodoList
            todos={activeTodos}
            emptyMessage={
              activeTab === 'completed'
                ? 'No completed todos yet.'
                : 'No active todos. Create one to get started!'
            }
            showNoteLinks
          />
        )}
      </div>
    </div>
  )
}
