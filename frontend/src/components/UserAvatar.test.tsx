import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserAvatar from './UserAvatar'

describe('UserAvatar', () => {
  it('renders image when avatarUrl is provided', () => {
    render(<UserAvatar avatarUrl="https://example.com/avatar.jpg" displayName="Alice Wonder" />)
    const img = screen.getByRole('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    expect(img).toHaveAttribute('alt', 'Alice Wonder')
  })

  it('renders initials fallback when no avatarUrl', () => {
    render(<UserAvatar displayName="Alice Wonder" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders initials fallback when avatarUrl is null', () => {
    render(<UserAvatar avatarUrl={null} displayName="Bob" />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('applies size classes', () => {
    const { container: sm } = render(<UserAvatar displayName="Test" size="sm" />)
    expect(sm.firstChild).toHaveClass('h-8', 'w-8')

    const { container: lg } = render(<UserAvatar displayName="Test" size="lg" />)
    expect(lg.firstChild).toHaveClass('h-16', 'w-16')
  })

  it('uppercases the initial', () => {
    render(<UserAvatar displayName="alice" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
