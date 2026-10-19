import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const healthState = { isError: true, isFetching: false, refetch: vi.fn() }
const reportProblem = vi.fn()

vi.mock('../hooks/useBackendHealth', () => ({
  useBackendHealth: () => healthState,
}))

vi.mock('../lib/api', () => ({
  reportProblem: (...args: unknown[]) => reportProblem(...args),
}))

import { OutageBanner } from './OutageBanner'

describe('OutageBanner', () => {
  it('renders nothing while the backend is healthy', () => {
    healthState.isError = false
    const { container } = render(<OutageBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains the outage and offers a mailto fallback', () => {
    healthState.isError = true
    render(<OutageBanner />)

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /email instead/i })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
  })

  it('reports the problem through the API when possible', async () => {
    healthState.isError = true
    reportProblem.mockResolvedValue({ status: 'received' })
    render(<OutageBanner />)

    fireEvent.click(screen.getByRole('button', { name: /report this/i }))

    await waitFor(() => {
      expect(screen.getByText(/admin has been notified/i)).toBeInTheDocument()
    })
    expect(reportProblem).toHaveBeenCalledWith(
      expect.objectContaining({ page: window.location.href })
    )
  })
})
