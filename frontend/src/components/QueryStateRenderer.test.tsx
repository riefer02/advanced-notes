import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryStateRenderer, ListLoadingSkeleton, QueryError } from './QueryStateRenderer'

describe('QueryStateRenderer', () => {
  it('renders loading state by default', () => {
    render(
      <QueryStateRenderer data={undefined} isLoading={true} error={null}>
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders custom loading component', () => {
    render(
      <QueryStateRenderer
        data={undefined}
        isLoading={true}
        error={null}
        loadingComponent={<div data-testid="custom-loader">Custom Loading</div>}
      >
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByTestId('custom-loader')).toBeInTheDocument()
  })

  it('renders error state', () => {
    render(
      <QueryStateRenderer data={undefined} isLoading={false} error={new Error('Test error')}>
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByText('Test error')).toBeInTheDocument()
  })

  it('renders custom error component', () => {
    render(
      <QueryStateRenderer
        data={undefined}
        isLoading={false}
        error={new Error('Test error')}
        errorComponent={<div data-testid="custom-error">Custom Error</div>}
      >
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByTestId('custom-error')).toBeInTheDocument()
  })

  it('renders children when data is available', () => {
    render(
      <QueryStateRenderer data="Hello World" isLoading={false} error={null}>
        {(data) => <span data-testid="content">Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByText('Data: Hello World')).toBeInTheDocument()
  })

  it('renders empty component when emptyCheck returns true', () => {
    render(
      <QueryStateRenderer
        data={{ items: [] }}
        isLoading={false}
        error={null}
        emptyCheck={(data) => data.items.length === 0}
        emptyComponent={<div data-testid="empty">No items</div>}
      >
        {(data) => <span>Items: {data.items.length}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByTestId('empty')).toBeInTheDocument()
  })

  it('renders children when emptyCheck returns false', () => {
    render(
      <QueryStateRenderer
        data={{ items: [1, 2, 3] }}
        isLoading={false}
        error={null}
        emptyCheck={(data) => data.items.length === 0}
        emptyComponent={<div data-testid="empty">No items</div>}
      >
        {(data) => <span data-testid="content">Items: {data.items.length}</span>}
      </QueryStateRenderer>
    )
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByText('Items: 3')).toBeInTheDocument()
  })

  it('returns null when data is undefined and not loading', () => {
    const { container } = render(
      <QueryStateRenderer data={undefined} isLoading={false} error={null}>
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when data is null and not loading', () => {
    const { container } = render(
      <QueryStateRenderer data={null} isLoading={false} error={null}>
        {(data) => <span>Data: {data}</span>}
      </QueryStateRenderer>
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('ListLoadingSkeleton', () => {
  it('renders default 3 skeleton items', () => {
    render(<ListLoadingSkeleton />)
    const skeleton = screen.getByRole('status', { name: 'Loading' })
    expect(skeleton.children.length).toBe(3)
  })

  it('renders custom count of skeleton items', () => {
    render(<ListLoadingSkeleton count={5} />)
    const skeleton = screen.getByRole('status', { name: 'Loading' })
    expect(skeleton.children.length).toBe(5)
  })
})

describe('QueryError', () => {
  it('renders error message', () => {
    render(<QueryError message="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
