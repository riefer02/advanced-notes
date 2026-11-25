import { useState, useEffect } from 'react'
import {
  useMeal,
  useUpdateMeal,
  useDeleteMeal,
  useAddMealItem,
  useUpdateMealItem,
  useDeleteMealItem,
} from '../hooks/useMeals'
import SlideOver from './ui/SlideOver'
import type { MealType, MealItem } from '../lib/api'
import { Cookie, Moon, Pencil, Sun, Sunrise, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataGrid, DataPoint, Disclosure } from '@/components/ui/detail'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface MealDetailSlideOverProps {
  isOpen: boolean
  onClose: () => void
  mealId: string | null
  onDeleted?: () => void
  calendarOwner?: string
  currentUserId?: string
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, typeof Sun> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}

export default function MealDetailSlideOver({
  isOpen,
  onClose,
  mealId,
  onDeleted,
  calendarOwner,
  currentUserId,
}: MealDetailSlideOverProps) {
  const { data: meal, isLoading } = useMeal(mealId, calendarOwner)
  const isOwner = !currentUserId || !meal || meal.user_id === currentUserId

  const updateMealMutation = useUpdateMeal()
  const deleteMealMutation = useDeleteMeal()
  const addItemMutation = useAddMealItem()
  const updateItemMutation = useUpdateMealItem()
  const deleteItemMutation = useDeleteMealItem()

  // Editing states
  const [isEditingTranscription, setIsEditingTranscription] = useState(false)
  const [editedTranscription, setEditedTranscription] = useState('')

  const [newItemName, setNewItemName] = useState('')
  const [newItemPortion, setNewItemPortion] = useState('')

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editedItemName, setEditedItemName] = useState('')
  const [editedItemPortion, setEditedItemPortion] = useState('')

  const [confirmDeleteMealOpen, setConfirmDeleteMealOpen] = useState(false)
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null)

  const actionError =
    updateMealMutation.error ??
    deleteMealMutation.error ??
    addItemMutation.error ??
    updateItemMutation.error ??
    deleteItemMutation.error

  // Reset state when meal changes
  useEffect(() => {
    if (meal) {
      setEditedTranscription(meal.transcription)
    }
    setIsEditingTranscription(false)
    setNewItemName('')
    setNewItemPortion('')
    setEditingItemId(null)
  }, [meal])

  // Never leave a confirmation hanging over a closed drawer.
  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteMealOpen(false)
      setConfirmDeleteItemId(null)
    }
  }, [isOpen])

  const handleMealTypeChange = (newType: MealType) => {
    if (!mealId || !meal) return
    updateMealMutation.mutate({
      mealId,
      data: { meal_type: newType },
    })
  }

  const handleDateChange = (newDate: string) => {
    if (!mealId || !meal) return
    updateMealMutation.mutate({
      mealId,
      data: { meal_date: newDate },
    })
  }

  const handleTranscriptionSave = () => {
    if (!mealId || !meal) return
    updateMealMutation.mutate(
      {
        mealId,
        data: { transcription: editedTranscription },
      },
      {
        onSuccess: () => setIsEditingTranscription(false),
      }
    )
  }

  const confirmDeleteMeal = async () => {
    if (!mealId) return
    try {
      await deleteMealMutation.mutateAsync(mealId)
      onDeleted?.()
      onClose()
    } catch {
      // deleteMealMutation.error renders in the alert above.
    }
  }

  const handleAddItem = () => {
    if (!mealId || !newItemName.trim()) return
    addItemMutation.mutate(
      {
        mealId,
        data: {
          name: newItemName.trim(),
          portion: newItemPortion.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setNewItemName('')
          setNewItemPortion('')
        },
      }
    )
  }

  const startEditingItem = (item: MealItem) => {
    setEditingItemId(item.id)
    setEditedItemName(item.name)
    setEditedItemPortion(item.portion || '')
  }

  const handleUpdateItem = () => {
    if (!mealId || !editingItemId || !editedItemName.trim()) return
    updateItemMutation.mutate(
      {
        mealId,
        itemId: editingItemId,
        data: {
          name: editedItemName.trim(),
          portion: editedItemPortion.trim() || undefined,
        },
      },
      {
        onSuccess: () => setEditingItemId(null),
      }
    )
  }

  const confirmDeleteItem = async () => {
    if (!mealId || !confirmDeleteItemId) return
    try {
      await deleteItemMutation.mutateAsync({ mealId, itemId: confirmDeleteItemId })
    } catch {
      // deleteItemMutation.error renders in the alert above.
    }
  }

  const MealTypeIcon = meal ? MEAL_TYPE_ICONS[meal.meal_type] : Sun
  const transcriptionLabel = meal?.model_version === 'manual' ? 'Note' : 'Transcription'
  const confirmDeleteItemName =
    meal?.items.find((item) => item.id === confirmDeleteItemId)?.name ?? 'this item'

  return (
    <>
      <SlideOver
        isOpen={isOpen}
        onClose={onClose}
        title={
          meal ? (
            <div className="flex items-center gap-2">
              <MealTypeIcon className="text-ink-muted size-5" aria-hidden />
              <span>{MEAL_TYPE_LABELS[meal.meal_type]}</span>
            </div>
          ) : (
            'Meal Details'
          )
        }
        width="max-w-lg"
      >
        <div className="pb-8">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="border-line border-t-ink size-7 animate-spin rounded-full border-2" />
            </div>
          ) : !meal ? (
            <div className="text-center py-12">
              <p className="text-ink-subtle text-sm">Meal not found</p>
            </div>
          ) : (
            <div className="space-y-5">
              {actionError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not save changes</AlertTitle>
                  <AlertDescription>
                    {actionError instanceof Error
                      ? actionError.message
                      : 'Please try again in a moment.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Meal Type Selector */}
              <div>
                <span className="section-label">Meal type</span>
                <div className="bg-surface-muted mt-1.5 grid grid-cols-4 gap-1 rounded-lg p-1">
                  {MEAL_TYPES.map((type) => {
                    const active = meal.meal_type === type
                    const Icon = MEAL_TYPE_ICONS[type]
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => isOwner && handleMealTypeChange(type)}
                        disabled={!isOwner}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                          active
                            ? 'bg-surface-raised text-ink shadow-card'
                            : 'text-ink-subtle hover:text-ink'
                        } ${!isOwner ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {MEAL_TYPE_LABELS[type]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Date */}
              <div>
                <span className="section-label">Date</span>
                <Input
                  type="date"
                  value={meal.meal_date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  disabled={!isOwner}
                  className="mt-1.5"
                />
              </div>

              {/* Transcription / note */}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="section-label">{transcriptionLabel}</span>
                  {!isEditingTranscription && isOwner && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTranscription(true)}
                      className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingTranscription ? (
                  <div className="mt-1.5 space-y-2">
                    <Textarea
                      value={editedTranscription}
                      onChange={(e) => setEditedTranscription(e.target.value)}
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingTranscription(false)
                          setEditedTranscription(meal.transcription)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleTranscriptionSave}
                        disabled={updateMealMutation.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="border-line-strong bg-surface-muted text-ink-muted mt-1.5 rounded-r-md border-l-2 px-3 py-2 text-[13px] leading-5 italic">
                    &ldquo;{meal.transcription}&rdquo;
                  </p>
                )}
              </div>

              {/* Food Items */}
              <div>
                <span className="section-label">Food items · {meal.items.length}</span>
                <div className="mt-1.5 space-y-1">
                  {meal.items.map((item) => (
                    <div
                      key={item.id}
                      className="border-line hover:bg-surface-muted/60 group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors"
                    >
                      {editingItemId === item.id ? (
                        <div className="flex flex-1 flex-col gap-2 py-1">
                          <Input
                            type="text"
                            value={editedItemName}
                            onChange={(e) => setEditedItemName(e.target.value)}
                            placeholder="Item name"
                            className="h-8 text-[13px]"
                          />
                          <Input
                            type="text"
                            value={editedItemPortion}
                            onChange={(e) => setEditedItemPortion(e.target.value)}
                            placeholder="Portion (optional)"
                            className="h-8 text-[13px]"
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setEditingItemId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="xs"
                              onClick={handleUpdateItem}
                              disabled={updateItemMutation.isPending}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-ink flex-1 truncate text-[13px] leading-5">
                            {item.name}
                          </span>
                          {item.portion && (
                            <span className="text-ink-subtle shrink-0 text-[11px]">
                              {item.portion}
                            </span>
                          )}
                          {isOwner && (
                            <div className="flex shrink-0 items-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => startEditingItem(item)}
                                    className="text-ink-subtle hover:bg-surface hover:text-ink grid size-6 place-items-center rounded transition-colors"
                                    aria-label="Edit item"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Edit item</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteItemId(item.id)}
                                    className="text-ink-subtle hover:bg-destructive/10 hover:text-destructive grid size-6 place-items-center rounded transition-colors"
                                    aria-label="Delete item"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Delete item</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {isOwner && (
                    <div className="flex gap-1.5 pt-1">
                      <Input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddItem()
                        }}
                        placeholder="Add food item…"
                        className="h-8 flex-1 text-[13px]"
                      />
                      <Input
                        type="text"
                        value={newItemPortion}
                        onChange={(e) => setNewItemPortion(e.target.value)}
                        placeholder="Portion"
                        className="h-8 w-20 text-[13px]"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddItem}
                        disabled={!newItemName.trim() || addItemMutation.isPending}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata — secondary, so it stays collapsed */}
              <Disclosure summary="Details" hint="confidence · timestamps">
                <DataGrid className="grid-cols-2 gap-y-2 sm:grid-cols-2">
                  {meal.confidence != null && (
                    <DataPoint label="Confidence" value={`${Math.round(meal.confidence * 100)}%`} />
                  )}
                  {meal.transcription_duration != null && (
                    <DataPoint
                      label="Duration"
                      value={`${meal.transcription_duration.toFixed(1)}s`}
                    />
                  )}
                  <DataPoint
                    label="Created"
                    value={new Date(meal.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  />
                  <DataPoint
                    label="Updated"
                    value={new Date(meal.updated_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  />
                </DataGrid>
              </Disclosure>

              {/* Delete Button */}
              {isOwner && (
                <div className="border-line border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/8 hover:text-destructive w-full"
                    onClick={() => setConfirmDeleteMealOpen(true)}
                    disabled={deleteMealMutation.isPending}
                  >
                    <Trash2 />
                    {deleteMealMutation.isPending ? 'Deleting…' : 'Delete meal'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>

      <ConfirmDialog
        open={confirmDeleteMealOpen}
        onOpenChange={setConfirmDeleteMealOpen}
        title="Delete this meal?"
        description="The meal and its food items will be removed from the calendar. This cannot be undone."
        confirmLabel="Delete meal"
        variant="destructive"
        pending={deleteMealMutation.isPending}
        onConfirm={confirmDeleteMeal}
      />

      <ConfirmDialog
        open={!!confirmDeleteItemId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteItemId(null)
        }}
        title="Remove this item?"
        description={`“${confirmDeleteItemName}” will be removed from this meal.`}
        confirmLabel="Remove item"
        variant="destructive"
        pending={deleteItemMutation.isPending}
        onConfirm={confirmDeleteItem}
      />
    </>
  )
}
