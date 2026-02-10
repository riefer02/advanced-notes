import { Link } from '@tanstack/react-router'
import { useUserProfile } from '../hooks/useProfile'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SharedContentBannerProps {
  ownerId: string
  backTo: '/vinyl' | '/meals'
  backLabel: string
  canEdit?: boolean
}

export default function SharedContentBanner({
  ownerId,
  backTo,
  backLabel,
  canEdit,
}: SharedContentBannerProps) {
  const { data: profile } = useUserProfile(ownerId)

  const displayName = profile?.display_name ?? 'someone'

  return (
    <Alert variant="info" className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <svg
          className="w-5 h-5 text-blue-600 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
        <AlertDescription className="text-sm text-blue-800 truncate">
          Viewing <strong>{displayName}&apos;s</strong> {backLabel.toLowerCase()}
          {canEdit && <span className="text-blue-600 ml-1">(you can add meals)</span>}
        </AlertDescription>
      </div>
      <Link
        to={backTo}
        className="text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
      >
        Back to mine
      </Link>
    </Alert>
  )
}
