import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UsernameInput from './UsernameInput'

// Default mock state
let mockAvailability: { available: boolean } | undefined = { available: true }
const mockIsFetching = false

vi.mock('../hooks/useProfile', () => ({
  useCheckUsername: (username: string) => ({
    data: username === 'taken' ? { available: false } : mockAvailability,
    isFetching: mockIsFetching,
  }),
}))

describe('UsernameInput', () => {
  it('renders with @ prefix', () => {
    render(<UsernameInput value="" onChange={() => {}} />)
    expect(screen.getByText('@')).toBeInTheDocument()
  })

  it('lowercases input', () => {
    const onChange = vi.fn()
    render(<UsernameInput value="" onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Alice' } })
    expect(onChange).toHaveBeenCalledWith('alice')
  })

  it('strips invalid characters', () => {
    const onChange = vi.fn()
    render(<UsernameInput value="" onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'alice@wonder!' } })
    expect(onChange).toHaveBeenCalledWith('alicewonder')
  })

  it('shows error for too-short username', () => {
    render(<UsernameInput value="ab" onChange={() => {}} />)
    expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument()
  })

  it('shows check mark for own username', () => {
    render(<UsernameInput value="myuser" onChange={() => {}} currentUsername="myuser" />)
    expect(screen.getByTitle('Your current username')).toBeInTheDocument()
  })

  it('shows available indicator for valid available username', () => {
    mockAvailability = { available: true }
    render(<UsernameInput value="alice.wonder" onChange={() => {}} />)
    expect(screen.getByTitle('Available')).toBeInTheDocument()
  })

  it('shows taken indicator for unavailable username', () => {
    render(<UsernameInput value="taken" onChange={() => {}} />)
    expect(screen.getByTitle('Taken')).toBeInTheDocument()
  })
})
