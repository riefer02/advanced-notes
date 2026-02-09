import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AvatarUploader from './AvatarUploader'

// Default hook mocks — overridden per-test as needed
const mockUploadAvatar = {
  mutate: vi.fn(),
  isPending: false,
}
const mockDeleteAvatar = {
  mutate: vi.fn(),
  isPending: false,
}

vi.mock('../hooks/useProfile', () => ({
  useUploadAvatar: () => mockUploadAvatar,
  useDeleteAvatar: () => mockDeleteAvatar,
}))

// Mock image compression
vi.mock('../lib/image-compression', () => ({
  compressImage: vi.fn().mockResolvedValue({
    file: new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
    originalSize: 100,
    compressedSize: 50,
  }),
}))

describe('AvatarUploader', () => {
  it('renders upload button', () => {
    render(<AvatarUploader displayName="Alice" />)
    expect(screen.getByText('Upload photo')).toBeInTheDocument()
  })

  it('shows remove button when avatar exists', () => {
    render(<AvatarUploader avatarUrl="https://example.com/avatar.jpg" displayName="Alice" />)
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('does not show remove button when no avatar', () => {
    render(<AvatarUploader displayName="Alice" />)
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('renders hidden file input', () => {
    const { container } = render(<AvatarUploader displayName="Alice" />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('hidden')
  })

  it('shows initials fallback when no avatar', () => {
    render(<AvatarUploader displayName="Alice" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows loading spinner during upload', () => {
    mockUploadAvatar.isPending = true
    const { container } = render(<AvatarUploader displayName="Alice" />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    mockUploadAvatar.isPending = false
  })

  it('hides remove button when no avatar', () => {
    render(<AvatarUploader avatarUrl={null} displayName="Alice" />)
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })
})
