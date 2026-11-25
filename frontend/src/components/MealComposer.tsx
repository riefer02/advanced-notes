import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Camera,
  Check,
  Cookie,
  ImagePlus,
  Loader2,
  Moon,
  Plus,
  Sun,
  Sunrise,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useCreateMeal, useExtractMealPhoto } from '../hooks/useMeals'
import type { MealEntry, MealPhotoExtraction, MealType } from '../lib/api'
import { compressImage } from '../lib/image-compression'
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
  /** The Meals page opened the composer through the Photo capture mode. */
  photoMode?: boolean
}

export default function MealComposer({
  onMealCreated,
  calendarOwner,
  initialDate,
  photoMode = false,
}: MealComposerProps) {
  const createMeal = useCreateMeal(calendarOwner)
  const extractPhoto = useExtractMealPhoto()

  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  const [mealDate, setMealDate] = useState(() => initialDate || todayIso())
  const [mealTime, setMealTime] = useState('')
  const [note, setNote] = useState('')

  const [items, setItems] = useState<DraftItem[]>([])
  const [itemName, setItemName] = useState('')
  const [itemPortion, setItemPortion] = useState('')
  const nextItemKey = useRef(1)

  // Photo scan state: an object URL preview, plus the last extraction summary.
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [scanSummary, setScanSummary] = useState<{ count: number; confidence: number } | null>(null)

  // The day panel can ask the composer to open on a different date.
  useEffect(() => {
    if (initialDate) setMealDate(initialDate)
  }, [initialDate])

  // Revoke the previous (or final) object URL; the preview is replaced often.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

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

  const applyPhotoExtraction = (extraction: MealPhotoExtraction) => {
    if (MEAL_TYPES.some((type) => type.value === extraction.meal_type)) {
      setMealType(extraction.meal_type)
    }
    if (extraction.meal_date) setMealDate(extraction.meal_date)
    setMealTime(extraction.meal_time ?? '')

    const extractedItems = extraction.items
      .map((item) => ({ name: item.name.trim(), portion: (item.portion ?? '').trim() }))
      .filter((item) => item.name)

    if (extractedItems.length > 0) {
      setItems(extractedItems.map((item) => ({ key: nextItemKey.current++, ...item })))
      setItemName('')
      setItemPortion('')
    }

    setScanSummary({ count: extractedItems.length, confidence: extraction.confidence })
  }

  const handlePhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Reset the input so choosing the same file again still fires onChange.
    input.value = ''
    if (!file || extractPhoto.isPending) return

    setPhotoError(null)
    setScanSummary(null)
    extractPhoto.reset()

    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file (JPEG, PNG, WebP, or HEIC).')
      return
    }

    // Shrink phone photos before upload; HEIC that cannot be decoded is sent
    // as-is and the server decides whether it can read it.
    let upload = file
    try {
      const compressed = await compressImage(file, { maxDimension: 1600, quality: 0.82 })
      upload = compressed.file
    } catch {
      upload = file
    }

    setPhotoPreview(URL.createObjectURL(upload))

    if (upload.size > 6 * 1024 * 1024) {
      setPhotoError('That photo is larger than 6 MB. Choose a smaller one.')
      return
    }

    try {
      const extraction = await extractPhoto.mutateAsync(upload)
      applyPhotoExtraction(extraction)
    } catch {
      // The mutation error renders inline below.
    }
  }

  const clearPhoto = () => {
    setPhotoPreview(null)
    setPhotoError(null)
    setScanSummary(null)
    extractPhoto.reset()
  }

  const canSave = items.length > 0 && !!mealDate && !createMeal.isPending
  const photoErrorMessage =
    photoError ??
    (extractPhoto.isError
      ? extractPhoto.error instanceof Error
        ? extractPhoto.error.message
        : 'Something went wrong while reading the photo.'
      : null)

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
      clearPhoto()
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

      <section
        aria-label="Scan a meal photo"
        className={
          photoMode
            ? 'border-line-strong bg-surface rounded-xl border border-dashed p-4'
            : 'border-line bg-surface-muted rounded-lg border p-3'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Camera
            className={`shrink-0 ${photoMode ? 'text-brand size-5' : 'text-domain-meals size-4'}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-ink text-[13px] font-medium">
              {photoMode ? 'Scan a meal or receipt' : 'Scan a photo'}
            </p>
            <p className="text-ink-subtle text-xs">
              {photoMode
                ? "We'll fill in the meal type and items, then you review and save."
                : 'Fill in the form from a photo of your plate or receipt.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
              disabled={extractPhoto.isPending}
            >
              <ImagePlus />
              {photoPreview ? 'Replace' : 'Choose'}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              disabled={extractPhoto.isPending}
              aria-label="Take a photo"
            >
              <Camera />
            </Button>
          </div>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        {photoPreview && (
          <div className="border-line bg-surface-sunken relative mt-3 overflow-hidden rounded-lg border">
            <img
              src={photoPreview}
              alt="Selected meal photo preview"
              className="h-36 w-full object-cover sm:h-44"
            />
            {extractPhoto.isPending && (
              <div
                role="status"
                className="bg-scrim absolute inset-0 grid place-items-center gap-1 text-center"
              >
                <Loader2 className="size-5 animate-spin text-white" aria-hidden />
                <span className="text-xs font-medium text-white">Reading photo…</span>
              </div>
            )}
            {!extractPhoto.isPending && (
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                className="border-line bg-surface text-ink-subtle hover:text-ink absolute top-2 right-2 grid size-7 place-items-center rounded-full border transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {scanSummary && !extractPhoto.isPending && (
          <p className="text-positive mt-2 flex items-center gap-1.5 text-xs" aria-live="polite">
            <Check className="size-3.5" aria-hidden />
            {scanSummary.count > 0
              ? `Found ${scanSummary.count} ${scanSummary.count === 1 ? 'item' : 'items'} · ${Math.round(
                  scanSummary.confidence * 100
                )}% confident — review below.`
              : 'No items were recognized — add them below.'}
          </p>
        )}

        {photoErrorMessage && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Could not read that photo</AlertTitle>
            <AlertDescription>{photoErrorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

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
