import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodoList from './TodoList'
import type { Todo } from '../lib/api'

// Mock the TodoItem component since it uses hooks
vi.mock('./TodoItem', () => ({
  default: ({ todo }: { todo: Todo }) => (
    <div data-testid={`todo-item-${todo.id}`}>
      <span data-testid="todo-title">{todo.title}</span>
      <span data-testid="todo-status">{todo.status}</span>
    </div>
  ),
}))

const createMockTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'test-id-1',
  user_id: 'user-1',
  title: 'Test Todo',
  description: null,
  note_id: null,
  status: 'accepted',
  confidence: null,
  extraction_context: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  completed_at: null,
  ...overrides,
})

describe('TodoList', () => {
  it('renders empty state when no todos', () => {
    render(<TodoList todos={[]} />)
    expect(screen.getByText('No todos found.')).toBeInTheDocument()
  })

  it('renders custom empty message', () => {
    render(<TodoList todos={[]} emptyMessage="Create your first todo!" />)
    expect(screen.getByText('Create your first todo!')).toBeInTheDocument()
  })

  it('renders list of todos', () => {
    const todos: Todo[] = [
      createMockTodo({ id: '1', title: 'First todo' }),
      createMockTodo({ id: '2', title: 'Second todo' }),
      createMockTodo({ id: '3', title: 'Third todo' }),
    ]

    render(<TodoList todos={todos} />)

    expect(screen.getByTestId('todo-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('todo-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('todo-item-3')).toBeInTheDocument()
  })

  it('renders todos with different statuses', () => {
    const todos: Todo[] = [
      createMockTodo({ id: '1', title: 'Suggested', status: 'suggested' }),
      createMockTodo({ id: '2', title: 'Accepted', status: 'accepted' }),
      createMockTodo({ id: '3', title: 'Completed', status: 'completed' }),
    ]

    render(<TodoList todos={todos} />)

    const statuses = screen.getAllByTestId('todo-status')
    expect(statuses[0]).toHaveTextContent('suggested')
    expect(statuses[1]).toHaveTextContent('accepted')
    expect(statuses[2]).toHaveTextContent('completed')
  })

  it('shows empty icon when no todos', () => {
    const { container } = render(<TodoList todos={[]} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
