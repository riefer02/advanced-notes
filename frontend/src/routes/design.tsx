import { createFileRoute } from '@tanstack/react-router'
import {
  Calendar,
  CheckCircle2,
  Disc3,
  FileText,
  Folder,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Callout,
  DataGrid,
  DataPoint,
  DetailCard,
  DetailCardHeader,
  DetailSection,
  Disclosure,
  MetaBar,
  MetaItem,
} from '@/components/ui/detail'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'

export const Route = createFileRoute('/design')({
  component: DesignSystemPage,
})

/**
 * Internal reference for the design system. Dev-only: not linked in the nav,
 * and it renders nothing in a production bundle.
 */
function DesignSystemPage() {
  if (!import.meta.env.DEV) {
    return (
      <div className="text-ink-subtle flex min-h-screen items-center justify-center text-sm">
        Not available
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl space-y-10 px-5 py-10 sm:px-8">
        <PageHeader
          eyebrow="Foundations"
          title="Chisos design system"
          description="Quiet surfaces, a single ink scale, one accent, and dense detail cards. Everything on this page is built from the primitives in components/ui."
          actions={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Badge variant="outline" className="text-2xs font-mono">
                v2
              </Badge>
            </div>
          }
        />

        <Palette />

        <section className="space-y-3">
          <SectionHeading
            title="Type scale"
            hint="22/17/15/13/11 — titles stay tight, metadata stays quiet."
          />
          <DetailCard className="space-y-4 p-5">
            <div>
              <p className="section-label mb-1">Display · 22 / semibold / -0.022em</p>
              <p className="text-ink text-[22px] leading-7 font-semibold tracking-[-0.022em]">
                Your life, quietly organized
              </p>
            </div>
            <div>
              <p className="section-label mb-1">Title · 17 / semibold</p>
              <p className="text-ink text-[17px] leading-6 font-semibold tracking-[-0.02em]">
                Weekly standup notes
              </p>
            </div>
            <div>
              <p className="section-label mb-1">Body · 15 / 1.75</p>
              <p className="text-ink/90 max-w-[60ch] text-[15px] leading-7">
                The record plays through the kitchen while coffee finishes. Notes from the morning
                are already tagged, sorted, and filed away.
              </p>
            </div>
            <div>
              <p className="section-label mb-1">Body small · 13 / 1.25rem</p>
              <p className="text-ink-muted max-w-[60ch] text-[13px] leading-5">
                Summaries, descriptions, and helper copy use the small body size so they never
                compete with the thing you came to read.
              </p>
            </div>
            <div>
              <p className="section-label mb-1">Meta · 12 / subtle</p>
              <MetaBar>
                <MetaItem icon={Calendar}>Mar 4, 3:12 PM</MetaItem>
                <MetaItem>412 words</MetaItem>
                <MetaItem icon={Folder}>work/notes</MetaItem>
              </MetaBar>
            </div>
          </DetailCard>
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Metrics"
            hint="Four-up on desktop, two-up on mobile. Icon + number + one line of context."
          />
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatCard icon={FileText} accent="notes" label="Notes" value={128} meta="recorded" />
            <StatCard
              icon={CheckCircle2}
              accent="tasks"
              label="Active"
              value={12}
              meta="48 done"
              badge={
                <Badge variant="info" className="text-2xs px-1.5 py-0 leading-4">
                  3 new
                </Badge>
              }
            />
            <StatCard
              icon={UtensilsCrossed}
              accent="meals"
              label="Meals"
              value={34}
              meta="2 today"
            />
            <StatCard icon={Disc3} accent="vinyl" label="Records" value={86} meta="41 artists" />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <SectionHeading
              title="Note detail"
              hint="Meta on one line. Summary demoted to a callout."
            />
            <div className="border-line bg-surface shadow-card space-y-4 rounded-xl border p-4">
              <div>
                <h3 className="text-ink text-[17px] leading-6 font-semibold tracking-[-0.02em]">
                  Weekly standup notes
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <MetaBar>
                    <MetaItem icon={Calendar}>Mar 4, 3:12 PM</MetaItem>
                    <MetaItem>412 words</MetaItem>
                    <MetaItem icon={Folder}>work/notes</MetaItem>
                  </MetaBar>
                  <Badge variant="neutral" className="text-2xs">
                    Audio
                  </Badge>
                </div>
              </div>
              <Callout label="Summary">
                <p className="text-ink text-[13px] leading-5">
                  Design system pass: tighter detail cards, one meta line, shared primitives.
                </p>
              </Callout>
              <div className="flex flex-wrap gap-1.5">
                {['design', 'frontend', 'q3'].map((tag) => (
                  <span
                    key={tag}
                    className="border-line bg-surface-muted text-ink-muted rounded-md border px-2 py-0.5 text-[11px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="border-line border-t pt-3">
                <p className="text-ink/90 text-[15px] leading-7">
                  Sparse is not empty. The note is the loudest thing on screen; everything around it
                  whispers.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeading
              title="Record detail"
              hint="Thumbnail identity, spec strip, dense tracklist."
            />
            <div className="border-line bg-surface shadow-card space-y-4 rounded-xl border p-4">
              <div className="flex items-start gap-4">
                <div className="bg-surface-sunken text-line-strong grid size-24 shrink-0 place-items-center rounded-lg">
                  <Disc3 className="size-8" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-ink text-[17px] leading-6 font-semibold tracking-[-0.02em]">
                    Kind of Blue
                  </h3>
                  <p className="text-ink-muted mt-0.5 text-[13px]">Miles Davis</p>
                  <MetaBar className="mt-2">
                    <MetaItem>1959</MetaItem>
                    <MetaItem>LP</MetaItem>
                    <MetaItem>VG+</MetaItem>
                  </MetaBar>
                </div>
              </div>
              <div className="border-line border-y py-3">
                <DataGrid className="sm:grid-cols-2">
                  <DataPoint label="Label" value="Columbia" />
                  <DataPoint label="Catalog" value="CL 1355" mono />
                  <DataPoint label="Pressing" value="US" />
                  <DataPoint label="Color" value="Black" />
                </DataGrid>
              </div>
              <DetailSection label="Tracklist · 5">
                <div className="border-line overflow-hidden rounded-lg border">
                  {[
                    ['A1', 'So What', '9:22'],
                    ['A2', 'Freddie Freeloader', '9:46'],
                    ['B1', 'Blue in Green', '5:37'],
                  ].map(([side, title, duration], index) => (
                    <div
                      key={title}
                      className={`hover:bg-surface-muted/60 flex items-baseline gap-3 px-3 py-1.5 ${
                        index > 0 ? 'border-line border-t' : ''
                      }`}
                    >
                      <span className="text-ink-subtle w-7 shrink-0 font-mono text-[10px]">
                        {side}
                      </span>
                      <span className="text-ink flex-1 truncate text-[13px] leading-5">
                        {title}
                      </span>
                      <span className="text-ink-subtle shrink-0 font-mono text-[10px]">
                        {duration}
                      </span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading title="Controls & feedback" hint="One primary action per view." />
          <DetailCard className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="section-label">Buttons</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Primary</Button>
                <Button size="sm" variant="outline">
                  Outline
                </Button>
                <Button size="sm" variant="ghost">
                  Ghost
                </Button>
                <Button size="sm" variant="destructive">
                  Destructive
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs">Extra small</Button>
                <Button size="xs" variant="outline">
                  Extra small
                </Button>
                <Button size="xs" variant="ghost">
                  Ghost
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="section-label">Badges</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="neutral">Neutral</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <p className="section-label">Callouts</p>
              <Callout label="Neutral">Quiet context, no emphasis.</Callout>
              <Callout tone="brand" label="Brand">
                Summary or AI context worth a beat of attention.
              </Callout>
              <Callout tone="warning" label="Warning">
                Suggested todos and recoverable actions.
              </Callout>
            </div>
            <div className="space-y-2">
              <p className="section-label">Fields</p>
              <Input placeholder="Untitled note" />
              <Input placeholder="Disabled" disabled />
              <p className="text-ink-subtle text-[11px] leading-4">
                Fields are 36px tall, 8px radius, hairline border, brand ring on focus.
              </p>
            </div>
          </DetailCard>
        </section>

        <section className="space-y-3">
          <SectionHeading
            title="Progressive detail"
            hint="Primary facts stay visible; secondary detail is one click away."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailCard>
              <DetailCardHeader
                icon={UtensilsCrossed}
                title="Meal detail"
                subtitle="Type and items first, metadata on demand."
              />
              <div className="border-line border-t px-4 py-3">
                <DataGrid className="grid-cols-2">
                  <DataPoint label="Meal" value="Lunch" />
                  <DataPoint label="Items" value="4" />
                </DataGrid>
              </div>
              <div className="px-4 pb-3">
                <Disclosure summary="Metadata" hint="confidence · timestamps">
                  <p className="text-ink-muted text-[13px] leading-5">
                    Confidence 92% · recorded 1:12 PM · updated 1:14 PM. Collapsed by default so it
                    never competes with the meal itself.
                  </p>
                </Disclosure>
              </div>
            </DetailCard>

            <DetailCard>
              <DetailCardHeader
                icon={CheckCircle2}
                title="Quiet actions"
                subtitle="Icon buttons get tooltips and labels; statuses stay textual."
              />
              <div className="border-line flex flex-wrap items-center gap-2 border-t px-4 py-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-sm" aria-label="Delete item">
                      <Trash2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete item</TooltipContent>
                </Tooltip>
                <Badge variant="success">Resolved</Badge>
                <Badge variant="warning">Triaged</Badge>
                <Badge variant="destructive">Open</Badge>
              </div>
            </DetailCard>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading title="Rules of thumb" hint="Keep these in your head." />
          <DetailCard className="grid gap-x-8 gap-y-3 p-5 text-[13px] leading-5 sm:grid-cols-2">
            {[
              [
                'One meta line',
                'Facts about an object go on one line with dot separators. Never stack them.',
              ],
              [
                'Two densities',
                'Page chrome is 20–24px; cards are 12–16px. Never p-6 inside a drawer.',
              ],
              [
                'One accent',
                'Brand indigo marks the current thing. Domain colors only tint icons and dots.',
              ],
              ['Flat at rest', 'Cards are a hairline and a whisper of shadow. Lift only on hover.'],
              [
                'Labels are small',
                'Section labels are 11px uppercase, tracked, and muted — never bold headings.',
              ],
              [
                'Read at 70ch',
                'Note bodies cap at 70 characters per line; everything else stays narrow.',
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <p className="text-ink font-medium">{title}</p>
                <p className="text-ink-muted mt-0.5">{body}</p>
              </div>
            ))}
          </DetailCard>
        </section>

        <DetailCard>
          <DetailCardHeader
            title="Anatomy of a detail card"
            subtitle="Header (title + action) → body → footer (quiet actions)."
            icon={FileText}
          />
          <div className="border-line border-t p-4">
            <div className="border-line bg-surface-muted/40 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
              <span className="text-ink-subtle text-xs">
                Header · 12px padding · 13px semibold title
              </span>
              <Button size="xs" variant="ghost">
                Action
              </Button>
            </div>
          </div>
        </DetailCard>
      </div>
    </div>
  )
}

function Palette() {
  const swatches = [
    ['Canvas', 'bg-background', ''],
    ['Surface', 'bg-surface', ''],
    ['Muted', 'bg-surface-muted', ''],
    ['Sunken', 'bg-surface-sunken', ''],
    ['Line', 'bg-line', ''],
    ['Brand', 'bg-brand', ''],
    ['Notes', 'bg-domain-notes', ''],
    ['Tasks', 'bg-domain-tasks', ''],
    ['Meals', 'bg-domain-meals', ''],
    ['Vinyl', 'bg-domain-vinyl', ''],
  ] as const

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Palette"
        hint="One neutral ramp for structure, one accent for state, four domain hues for recognition."
      />
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {swatches.map(([label, className]) => (
          <div key={label}>
            <div
              className={`border-line ring-ink/5 h-10 rounded-lg border ring-1 ring-inset ${className}`}
            />
            <p className="text-ink-subtle mt-1 truncate text-[10px] font-medium">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-ink text-[15px] font-semibold tracking-[-0.015em]">{title}</h2>
      {hint && <p className="text-ink-subtle text-xs">{hint}</p>}
    </div>
  )
}
