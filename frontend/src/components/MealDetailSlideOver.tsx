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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface MealDetailSlideOverProps {
  isOpen: boolean
  onClose: () => void
  mealId: string | null
  onDeleted?: () => void
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍿',
}

export default function MealDetailSlideOver({
  isOpen,
  onClose,
  mealId,
  onDeleted,
}: MealDetailSlideOverProps) {
  const { data: meal, isLoading } = useMeal(mealId)

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

  const handleDeleteMeal = () => {
    if (!mealId) return
    if (!confirm('Are you sure you want to delete this meal?')) return
    deleteMealMutation.mutate(mealId, {
      onSuccess: () => {
        onDeleted?.()
        onClose()
      },
    })
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

  const handleDeleteItem = (itemId: string) => {
    if (!mealId) return
    if (!confirm('Delete this item?')) return
    deleteItemMutation.mutate({ mealId, itemId })
  }

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={
        meal ? (
          <div className="flex items-center gap-2">
            <span className="text-xl">{MEAL_TYPE_ICONS[meal.meal_type]}</span>
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
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : !meal ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Meal not found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Meal Type Selector */}
            <div>
              <Label className="mb-2">Meal Type</Label>
              <div className="flex gap-2">
                {MEAL_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleMealTypeChange(type)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      meal.meal_type === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {MEAL_TYPE_ICONS[type]} {MEAL_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <Label className="mb-2">Date</Label>
              <Input
                type="date"
                value={meal.meal_date}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>

            {/* Transcription */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Transcription</Label>
                {!isEditingTranscription && (
                  <button
                    type="button"
                    onClick={() => setIsEditingTranscription(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                )}
              </div>
              {isEditingTranscription ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedTranscription}
                    onChange={(e) => setEditedTranscription(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleTranscriptionSave}
                      disabled={updateMealMutation.isPending}
                    >
                      Save
                    </Button>
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
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 italic bg-gray-50 p-3 rounded-lg">
                  &quot;{meal.transcription}&quot;
                </p>
              )}
            </div>

            {/* Food Items */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Food Items ({meal.items.length})
              </h3>
              <div className="space-y-2">
                {meal.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    {editingItemId === item.id ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          type="text"
                          value={editedItemName}
                          onChange={(e) => setEditedItemName(e.target.value)}
                          placeholder="Item name"
                        />
                        <Input
                          type="text"
                          value={editedItemPortion}
                          onChange={(e) => setEditedItemPortion(e.target.value)}
                          placeholder="Portion (optional)"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={handleUpdateItem}
                            disabled={updateItemMutation.isPending}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingItemId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <span className="text-sm text-gray-800">{item.name}</span>
                          {item.portion && (
                            <span className="text-xs text-gray-500 ml-2">({item.portion})</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditingItem(item)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          aria-label="Edit item"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-red-400 hover:text-red-600"
                          aria-label="Delete item"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add Item Form */}
                <div className="flex gap-2 mt-3">
                  <Input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Add food item..."
                    className="flex-1"
                  />
                  <Input
                    type="text"
                    value={newItemPortion}
                    onChange={(e) => setNewItemPortion(e.target.value)}
                    placeholder="Portion"
                    className="w-24"
                  />
                  <Button
                    onClick={handleAddItem}
                    disabled={!newItemName.trim() || addItemMutation.isPending}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                {meal.confidence && (
                  <div>
                    <span className="font-medium">Confidence:</span>{' '}
                    {Math.round(meal.confidence * 100)}%
                  </div>
                )}
                {meal.transcription_duration && (
                  <div>
                    <span className="font-medium">Duration:</span>{' '}
                    {meal.transcription_duration.toFixed(1)}s
                  </div>
                )}
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  {new Date(meal.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Updated:</span>{' '}
                  {new Date(meal.updated_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Delete Button */}
            <div className="border-t pt-4">
              <Button
                variant="ghost"
                className="w-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                onClick={handleDeleteMeal}
                disabled={deleteMealMutation.isPending}
              >
                {deleteMealMutation.isPending ? 'Deleting...' : 'Delete Meal'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  )
}
