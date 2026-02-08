interface UserAvatarProps {
  avatarUrl?: string | null
  displayName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
}

const bgColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-rose-500',
]

function getColorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return bgColors[Math.abs(hash) % bgColors.length]
}

export default function UserAvatar({
  avatarUrl,
  displayName,
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const initial = (displayName || '?')[0].toUpperCase()
  const sizeClass = sizeClasses[size]
  const bgColor = getColorForName(displayName)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} ${bgColor} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}
    >
      {initial}
    </div>
  )
}
