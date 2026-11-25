import {
  CheckCircle2,
  FileText,
  LayoutDashboard,
  Library,
  MessageCircle,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  to:
    | '/dashboard'
    | '/library'
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
  { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/summaries', label: 'Summaries', icon: FileText },
  { to: '/todos', label: 'Todos', icon: CheckCircle2 },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/feedback', label: 'Feedback', icon: MessageCircle },
]

/** Routes that still use the app shell even when they are not in the sidebar. */
export const APP_ROUTES: { to: NavItem['to']; label: string }[] = [
  ...NAV_ITEMS.map(({ to, label }) => ({ to, label })),
  { to: '/notes', label: 'Notes' },
  { to: '/meals', label: 'Meals' },
  { to: '/vinyl', label: 'Vinyl' },
]
