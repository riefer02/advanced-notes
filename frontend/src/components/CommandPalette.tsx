import { useNavigate } from '@tanstack/react-router'
import { Mic, MessageSquare, FileText, UtensilsCrossed, Disc3, MessageCircle } from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { NAV_ITEMS } from './layout/AppShell'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenAsk: () => void
}

const QUICK_ACTIONS = [
  { label: 'Record a Note', to: '/notes' as const, icon: Mic },
  { label: 'Ask Notes', action: 'ask' as const, icon: MessageSquare },
  { label: 'Create Summary', to: '/summaries' as const, icon: FileText },
  { label: 'Log a Meal', to: '/meals' as const, icon: UtensilsCrossed },
  { label: 'Browse Vinyl', to: '/vinyl' as const, icon: Disc3 },
  { label: 'Send Feedback', to: '/feedback' as const, icon: MessageCircle },
]

export function CommandPalette({ isOpen, onClose, onOpenAsk }: CommandPaletteProps) {
  const navigate = useNavigate()

  const handleNavSelect = (to: string) => {
    void navigate({ to })
    onClose()
  }

  const handleActionSelect = (action: (typeof QUICK_ACTIONS)[number]) => {
    if ('action' in action && action.action === 'ask') {
      onOpenAsk()
    } else if ('to' in action) {
      void navigate({ to: action.to })
    }
    onClose()
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Command Palette"
      description="Search pages and actions"
      showCloseButton={false}
    >
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.to} onSelect={() => handleNavSelect(item.to)}>
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick Actions">
          {QUICK_ACTIONS.map((action) => (
            <CommandItem key={action.label} onSelect={() => handleActionSelect(action)}>
              <action.icon className="h-4 w-4" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
