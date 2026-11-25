import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Cookie, Moon, Plus, Sun, Sunrise, UtensilsCrossed, X } from 'lucide-react'
import { useCreateMeal } from '../hooks/useMeals'
import type { MealEntry, MealType } from '../lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MEAL_TYPES: Array<{ value: MealType; label: string; icon: typeof Sun }> = [
  { value: 'breakfast', label: 'Breakfast', icon: Sunrise },
  { value: 'lunch', label: 'Lunch', icon: Sun },
  { value: 'dinner', label: 'Dinner', icon: Moon },
  { value: 'snack', label: 'Snack', icon: Cookie },
]

interface DraftItem {
  key: number
  name: string
  portion: string
}

function todayIso(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`
}

function defaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 22) return 'dinner'
  return 'snack'
}

function formatDateLabel(value: string): string {
  if (!value) return ''
  if (value === todayIso()) return 'Today'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface MealComposerProps {
  onMealCreated?: (meal: MealEntry) => void
  calendarOwner?: string
  /** Date the composer opens with, e.g. from the day panel. */
  initialDate?: string
}

export default function MealComposer({
  onMealCreated,
  calendarOwner,
  initialDate,
}: MealComposerProps) {
  const createMeal = useCreateMeal(calendarOwner)

  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  const [mealDate, setMealDate] = useState(() => initialDate || todayIso())
  const [mealTime, setMealTime] = useState('')
  const [note, setNote] = useState('')

  const [items, setItems] = useState<DraftItem[]>([])
  const [itemName, setItemName] = useState('')
  const [itemPortion, setItemPortion] = useState('')
  const nextItemKey = useRef(1)

  // The day panel can ask the composer to open on a different date.
  useEffect(() => {
    if (initialDate) setMealDate(initialDate)
  }, [initialDate])

  const addItem = () => {
    const name = itemName.trim()
    if (!name) return
    setItems((current) => [
      ...current,
      { key: nextItemKey.current++, name, portion: itemPortion.trim() },
    ])
    setItemName('')
    setItemPortion('')
  }

  const removeItem = (key: number) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const canSave = items.length > 0 && !!mealDate && !createMeal.isPending

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return

    try {
      const meal = await createMeal.mutateAsync({
        meal_type: mealType,
        meal_date: mealDate,
        meal_time: mealTime || undefined,
        transcription: note.trim() || undefined,
        items: items.map((item) => ({
          name: item.name,
          portion: item.portion || undefined,
        })),
      })
      setItems([])
      setItemName('')
      setItemPortion('')
      setNote('')
      onMealCreated?.(meal)
    } catch {
      // The mutation error renders below.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          void handleSubmit(event)
        }
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="text-brand size-5" aria-hidden />
        <h2 className="text-ink text-lg font-semibold">Log a meal</h2>
      </div>

      <p className="text-ink-muted text-sm">
        Add what you ate. No microphone needed — useful for quick entries, restaurants, and
        backfilling a day.
      </p>

      <div>
        <span className="section-label">Meal type</span>
        <div className="border-line bg-surface mt-1.5 grid grid-cols-2 gap-1 rounded-lg border p-1 sm:grid-cols-4">
          {MEAL_TYPES.map((type) => {
            const Icon = type.icon
            const active = mealType === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setMealType(type.value)}
                aria-pressed={active}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-brand-soft text-brand shadow-card'
                    : 'text-ink-subtle hover:text-ink hover:bg-surface-muted'
                }`}
              >
                <Icon className="size-3.5" aria-hidden />
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meal-composer-date">Date</Label>
          <Input
            id="meal-composer-date"
            type="date"
            value={mealDate}
            onChange={(event) => setMealDate(event.target.value)}
            aria-required="true"
          />
          <p className="text-ink-subtle text-xs">Logging for {formatDateLabel(mealDate)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meal-composer-time">Time (optional)</Label>
          <Input
            id="meal-composer-time"
            type="time"
            value={mealTime}
            onChange={(event) => setMealTime(event.target.value)}
          />
        </div>
      </div>

      <div>
        <span className="section-label">Food items</span>
        <div className="mt-1.5 flex gap-1.5">
          <Input
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addItem()
              }
            }}
            placeholder="Add a food item…"
            aria-label="Food item name"
            className="flex-1"
          />
          <Input
            value={itemPortion}
            onChange={(event) => setItemPortion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addItem()
              }
            }}
            placeholder="Portion"
            aria-label="Food item portion"
            className="w-24"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addItem}
            disabled={!itemName.trim()}
            aria-label="Add food item"
          >
            <Plus />
            Add
          </Button>
        </div>

        {items.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li
                key={item.key}
                className="border-line bg-surface-muted text-ink inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-[13px]"
              >
                <span>{item.name}</span>
                {item.portion && <span className="text-ink-subtle text-xs">{item.portion}</span>}
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  aria-label={`Remove ${item.name}`}
                  className="text-ink-subtle hover:bg-surface hover:text-ink grid size-5 place-items-center rounded-full transition-colors"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-subtle mt-2 text-xs">Add at least one item to save this meal.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-composer-note">Note (optional)</Label>
        <Textarea
          id="meal-composer-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Anything worth remembering — where, who, how it tasted…"
        />
      </div>

      {createMeal.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not save meal</AlertTitle>
          <AlertDescription>
            {createMeal.error instanceof Error
              ? createMeal.error.message
              : 'Please check the details and try again.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="border-line flex items-center justify-between gap-3 border-t pt-4">
        <Button type="submit" disabled={!canSave} loading={createMeal.isPending}>
          Save meal
        </Button>
        <span className="text-ink-subtle text-xs">⌘/Ctrl + Enter</span>
      </div>
    </form>
  )
}
