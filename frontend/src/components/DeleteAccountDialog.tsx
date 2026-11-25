import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccount } from '@/lib/api'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function DeleteAccountDialog({ open, onOpenChange, onDeleted }: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setConfirmation('')
    setDeleting(false)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (deleting) return
    if (!next) reset()
    onOpenChange(next)
  }

  const handleDelete = async () => {
    if (confirmation !== 'DELETE') return
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount()
      reset()
      onOpenChange(false)
      onDeleted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete your account.')
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!deleting} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.02em]">Delete account?</DialogTitle>
          <DialogDescription className="text-ink-muted text-[13px] leading-5">
            This permanently deletes your notes, audio, todos, meals, vinyl records, shares,
            profile, and usage history. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="delete-account-confirm">
            Type <span className="text-destructive font-mono">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-account-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            autoFocus
            disabled={deleting}
            aria-required="true"
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-[13px]">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={confirmation !== 'DELETE'}
            loading={deleting}
          >
            Delete account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
