import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState, NoResultsState, NoNotesState, NoTodosState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />)
    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Add some items to get started" />)
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByText('Add some items to get started')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState title="Custom" icon={<span data-testid="custom-icon">Icon</span>} />)
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('renders action button', () => {
    render(
      <EmptyState
        title="No items"
        action={<button data-testid="action-btn">Add Item</button>}
      />
    )
    expect(screen.getByTestId('action-btn')).toBeInTheDocument()
    expect(screen.getByText('Add Item')).toBeInTheDocument()
  })

  it('renders default icon when none provided', () => {
    const { container } = render(<EmptyState title="Test" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

describe('NoResultsState', () => {
  it('renders no results message without query', () => {
    render(<NoResultsState />)
    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(
      screen.getByText('Try adjusting your search terms or browse all items.')
    ).toBeInTheDocument()
  })

  it('renders no results message with query', () => {
    render(<NoResultsState query="test search" />)
    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(
      screen.getByText('No matches for "test search". Try adjusting your search terms.')
    ).toBeInTheDocument()
  })
})

describe('NoNotesState', () => {
  it('renders no notes message', () => {
    render(<NoNotesState />)
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Start recording your first voice note/)
    ).toBeInTheDocument()
  })
})

describe('NoTodosState', () => {
  it('renders generic no todos message', () => {
    render(<NoTodosState />)
    expect(screen.getByText('No todos yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Create todos manually or let AI extract them/)
    ).toBeInTheDocument()
  })

  it('renders suggested todos empty state', () => {
    render(<NoTodosState status="suggested" />)
    expect(screen.getByText('No suggested todos')).toBeInTheDocument()
    expect(screen.getByText(/Record voice notes mentioning tasks/)).toBeInTheDocument()
  })

  it('renders accepted todos empty state', () => {
    render(<NoTodosState status="accepted" />)
    expect(screen.getByText('No accepted todos')).toBeInTheDocument()
    expect(screen.getByText(/Accept suggested todos/)).toBeInTheDocument()
  })

  it('renders completed todos empty state', () => {
    render(<NoTodosState status="completed" />)
    expect(screen.getByText('No completed todos')).toBeInTheDocument()
    expect(screen.getByText(/Mark todos as complete/)).toBeInTheDocument()
  })
})
