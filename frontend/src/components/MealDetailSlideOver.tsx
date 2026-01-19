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
              <label className="block text-sm font-medium text-gray-700 mb-2">Meal Type</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={meal.meal_date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Transcription */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Transcription</label>
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
                  <textarea
                    value={editedTranscription}
                    onChange={(e) => setEditedTranscription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleTranscriptionSave}
                      disabled={updateMealMutation.isPending}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTranscription(false)
                        setEditedTranscription(meal.transcription)
                      }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
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
                        <input
                          type="text"
                          value={editedItemName}
                          onChange={(e) => setEditedItemName(e.target.value)}
                          placeholder="Item name"
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={editedItemPortion}
                          onChange={(e) => setEditedItemPortion(e.target.value)}
                          placeholder="Portion (optional)"
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={handleUpdateItem}
                            disabled={updateItemMutation.isPending}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
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
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Add food item..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={newItemPortion}
                    onChange={(e) => setNewItemPortion(e.target.value)}
                    placeholder="Portion"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!newItemName.trim() || addItemMutation.isPending}
                    className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
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
              <button
                type="button"
                onClick={handleDeleteMeal}
                disabled={deleteMealMutation.isPending}
                className="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {deleteMealMutation.isPending ? 'Deleting...' : 'Delete Meal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  )
}
