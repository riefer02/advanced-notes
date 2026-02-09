import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

// Mock settings hooks
vi.mock('../hooks/useSettings', () => ({
  useUserSettings: () => ({ data: { auto_accept_todos: false }, isLoading: false }),
  useUpdateUserSettings: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Mock profile hooks
const mockProfile = {
  user_id: 'test-user',
  display_name: 'Test User',
  username: null,
  bio: null,
  discoverable: true,
  avatar_url: null,
}

vi.mock('../hooks/useProfile', () => ({
  useMyProfile: () => ({ data: mockProfile, isLoading: false }),
  useUpdateProfile: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
  useUploadAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useCheckUsername: () => ({ data: undefined, isFetching: false }),
}))

// Mock image compression
vi.mock('../lib/image-compression', () => ({
  compressImage: vi.fn().mockResolvedValue({
    file: new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
    originalSize: 100,
    compressedSize: 50,
  }),
}))

// Mock TanStack Router — createFileRoute returns a function that extracts the component
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
}))

// Import after mocks — Route.component is the SettingsPage function
import { Route } from './settings'

const SettingsPage = (Route as unknown as { component: React.ComponentType }).component

describe('SettingsPage', () => {
  it('renders profile section heading', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('shows save button only when changes exist', () => {
    render(<SettingsPage />)

    // Initially no changes — save button should not be present
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument()

    // Change the display name field
    const displayNameInput = screen.getByLabelText('Display name')
    fireEvent.change(displayNameInput, { target: { value: 'New Name' } })

    // Now save button should appear
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })
})
