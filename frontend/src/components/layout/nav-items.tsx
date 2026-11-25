import {
  CheckCircle2,
  Disc3,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Settings,
  StickyNote,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  to:
    | '/dashboard'
    | '/summaries'
    | '/notes'
    | '/todos'
    | '/meals'
    | '/vinyl'
    | '/friends'
    | '/settings'
    | '/feedback'
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/summaries', label: 'Summaries', icon: FileText },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/todos', label: 'Todos', icon: CheckCircle2 },
  { to: '/meals', label: 'Meals', icon: UtensilsCrossed },
  { to: '/vinyl', label: 'Vinyl', icon: Disc3 },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/feedback', label: 'Feedback', icon: MessageCircle },
]
