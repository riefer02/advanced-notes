# Chisos — Product Design Review

**Date:** 2026-11-25  
**Reviewer:** Product design audit (live production + source)  
**Scope:** `chisos.xyz` as Andrew (real data: 49 notes, 17 active todos, 1 vinyl record), desktop 1456×756 and mobile 390×844, plus the frontend code and the 2026-11-10 roadmap.

---

## Executive summary

Chisos has a genuinely good visual foundation. The token system, dark mode, density rules, focus-trapped drawers, and capture retry flow are better than most solo-built products. The problems are mostly not "make it prettier" problems. They are **retrieval, continuity, and trust** problems:

1. **The global search does not search content.** `⌘K` opens a command palette that only lists pages and actions; typing a word that exists in a note returns "No results found." The note search that works is buried inside `/notes`.
2. **The note editor can lose work silently.** Editing a note and then clicking the backdrop, pressing Escape, or opening another note discards changes with no warning and no autosave.
3. **The Summaries page renders raw JSON.** Every digest preview currently looks like `{"summary":"The notes combine...` instead of a readable summary.
4. **Sharing loses its context.** "Share Calendar" on Meals opens the generic sharing form with **Vinyl Library** preselected, because the link carries only `?tab=shares`.
5. **AI limits are invisible.** The backend enforces 100 transcription minutes / 500 AI calls per month and returns used/limit/reset data in 429s, but the app never shows usage and the client throws that data away.

The highest-leverage design move is not another feature. It is to make **capture → organize → find** feel like one product instead of five parallel recorders. The current dashboard shows counts; the current nav separates the domains; the current search cannot cross them. The roadmap's own thesis — "capture a thought in under five seconds and find it again with confidence" — is stronger than the UI currently communicates.

---

## Scorecard

| Area | Grade | Read |
|---|---|---|
| Visual system / tokens / dark mode | **A−** | Coherent, quiet, AA contrast, good density. Minor emoji/legacy-SVG drift. |
| Capture (record / upload / write) | **B+** | Retry, drafts, and keyboard shortcuts are excellent; no review step, no local size checks. |
| Notes browsing | **B−** | Strong cards and detail drawer; tag wall and unpaginated list get in the way. |
| Retrieval / search / Ask | **C** | Note search works; global search is commands-only; Ask speaks in internals. |
| Todos | **B−** | Clear and fast; low density, small tap targets, no search/sort/due dates. |
| Meals | **C+** | Voice capture is pleasant; no typed/photo path, no date intent at capture, no add-from-day. |
| Vinyl | **B** | Good grid and filters; filter bar is heavy; count grammar bug; no collection insight. |
| AI surfaces | **C+** | Useful output, but leaks internals and hides scope, cost, and citations. |
| Trust / privacy / portability | **C+** | Outage banner and reports are good; quota is invisible, export absent, discoverability on by default. |
| Mobile | **C+** | Responsive and usable; capture-first, but header chrome and tap targets need work. |
| Accessibility | **B−** | Focus traps, labels, reduced motion, AA contrast; small targets and missing aria-pressed/skip link. |

---

## What is working (keep it)

- **The design system is real, not a mood board.** `index.css` tokens, `DetailCard`/`MetaBar`/`PageHeader`, 70ch body, and the light/dark parity hold up in production. Measured contrast: `ink-subtle` on `surface` is **5.06:1** (light) / **4.91:1** (dark); `ink-muted` is **6.83:1**; brand on soft is **4.61:1**. All text pairs I checked meet AA.
- **Drawer mechanics are strong.** `SlideOver` traps Tab, restores focus, stacks nested drawers, closes only the topmost on Escape, and locks body scroll (`frontend/src/components/ui/SlideOver.tsx`).
- **Capture failure handling is thoughtful.** A failed transcription keeps the blob for retry/download; typed notes keep a per-user localStorage draft (`AudioUploader.tsx`, `NoteComposer.tsx`).
- **Small interaction details.** `/` focuses note search, `⌘/Ctrl+Enter` saves, `⌘K` opens the palette, delete is hidden until hover on pointer devices but always visible on touch, and the outage banner offers retry/report/email.
- **Clear user scoping.** All reads/writes are user-scoped; the sharing layer and admin route are deliberately separated.

---

## P0 — Fix this week

### 1. `⌘K` / "Search" does not search the user's content

**Evidence:** `CommandPalette` only maps `NAV_ITEMS` and `QUICK_ACTIONS` (`frontend/src/components/CommandPalette.tsx:28-85`). On production, searching `prayer` — a tag on an existing note — returned **"No results found."** The working note search lives only inside `/notes` (`NotesPanel` → `SearchBar`), and the header calls the command palette "Search".

**Why it matters:** Search is the product's stated moat ("find it again with confidence"), and `⌘K` is the universal search gesture. Right now the most discoverable search affordance is the one that cannot find content.

**Recommendation:** Make `⌘K` a unified search:

- Empty state: recent notes, recent meals, recent records, and pages.
- Query state: grouped results — **Notes** (title/summary/tag/snippet), **Meals** (item/transcription/date), **Vinyl** (artist/album), **Pages/Actions**.
- Keep the command actions, but after content results.
- Show a "Search all notes for …" fallback that deep-links to `/notes?q=…` and focuses the field.
- If a unified index is too large a first step, relabel the current palette to "Commands" and move a real content search into the header. But the unified version is the right product move.

**Effort:** M. **Roadmap:** partially covered by Phase 7 "typed-object queries"; pull the note portion into Phase 5.

---

### 2. Unsaved note edits disappear on close

**Evidence:** `NoteDetail` keeps title/content/tags in local state (`frontend/src/components/NoteDetail.tsx:80-87`). `NotesPanel` closes the drawer with `onClose={() => setSelectedNote(null)}` (`NotesPanel.tsx:403-407`). There is no dirty flag, no `beforeunload`-style guard, and no autosave. Escape and backdrop click both close. Selecting another note changes the `key` and unmounts the editor.

**Why it matters:** This directly contradicts the Notes page copy — *"Capture, pin, archive, and restore — nothing is lost by accident."* It is the kind of bug users only report after losing something they cared about.

**Recommendation:**

- Track `isDirty` from the editor's initial values.
- If dirty, intercept `onClose`: show an in-app **"Save changes / Discard / Keep editing"** dialog, not `window.confirm`.
- Autosave a draft keyed by `note.id` while editing, and clear it on save/discard.
- Disable backdrop-click close while dirty; keep the explicit X and Escape guarded.
- Add a regression test: edit → Escape → reopen → text still there.

**Effort:** S–M. **Roadmap:** already listed as Phase 3/5 "Autosave + unsaved-change guard" — this is the highest-value unchecked item in that list.

---

### 3. Summaries previews render raw JSON

**Evidence:** `DigestList` strips markdown characters from `d.content` and slices 110 chars (`frontend/src/routes/summaries.tsx:397-404`). Digest content is JSON (`{"summary": ..., "key_themes": ..., "action_items": ...}`), which the detail drawer parses but the list does not. Production currently shows every row as `{"summary":"...`.

**Why it matters:** This is the first screen of the "AI summarizes your life" feature. It looks broken and makes the AI output feel untrustworthy before the user reads a word.

**Recommendation:**

- Parse the same shape the drawer uses; render the summary's first sentence/line as the row title, then date + themes.
- Keep a plain-text fallback for legacy rows.
- Add a tiny test with JSON, malformed JSON, and plain text.
- Use the app's `formatTimestamp`-style dates here too; the list currently uses `toLocaleString()` and shows `11/13/2026, 3:44:02 PM`, while notes use `Nov 13, 3:44 PM`.

**Effort:** S. **Roadmap:** not listed — do it now.

---

### 4. "Share Calendar" can create a Vinyl share

**Evidence:** Meals links to `/friends?tab=shares` (`frontend/src/routes/meals.tsx:130-136`) and Vinyl does the same (`VinylLibrary.tsx:71-75`). `CreateShareSection` always initializes `resourceType` to `'vinyl_library'` (`ShareManager.tsx:116`). Neither entry point passes a resource hint.

**Why it matters:** A user clicking "Share Calendar" reasonably expects to share a calendar. They land on a form that will share their vinyl library if they only pick a friend and press Share. That is a privacy/consent bug, not just a polish issue.

**Recommendation:**

- Add `?resource=meal_calendar|vinyl_library` to the links and read it in `ShareManager`.
- Put the resource selector first and show a one-line confirmation: "Share your Meal Calendar with Aastha — view only."
- After creation, return to the originating surface or show the new share inline.

**Effort:** S. **Roadmap:** not listed — do it now.

---

## P1 — The next product-level improvements

### 5. Surface usage, quotas, and 429s

The backend already has everything: `usage_quotas` (100 minutes / 500 AI calls by default), `GET /api/usage`, and a 429 payload with `used`, `limit`, `unit`, and `resets_at` (`backend/app/routes/_helpers.py:232-264`, `backend/app/routes/usage.py`). The frontend never calls the usage endpoint, and `throwResponseError` keeps only `error` and discards `quota` (`frontend/src/lib/api/core.ts:93-113`). A user hitting the cap sees "Monthly quota exceeded" with no warning, no numbers, and no reset date.

**Recommendation:**

- Add a `Usage` card to Settings: minutes used/limit, AI calls used/limit, period end, tier.
- Show a quiet 80% warning on the dashboard or in the record panel (the backend already computes `warning`).
- Humanize 429s: "You've used 100 of 100 transcription minutes. Resets Dec 1." with a link to Settings → Usage.
- Put the same information on the marketing/pricing surface; "Free to start" currently gives no idea of the limits.

**Effort:** M. **Roadmap:** add to Phase 6 (trust).

---

### 6. Rebuild the Notes page around the list, not the filters

**Evidence from production:** 49 notes produce **228 tag buttons in a 22,902px-wide horizontal strip**; the first note starts at **y=351** in a 756px viewport, so roughly four cards are visible. The count briefly reads **"0 notes"** while loading because `noteCount` falls back to `0` (`NotesPanel.tsx:76-83`). On mobile, only ~3.5 tags are visible behind a fade, and the expand control is easy to miss.

**Recommendation:**

- Replace the always-on tag strip with a compact **Filters** row: active filter chips + "Tags (228)" button + folder toggle.
- In the tag popover: search, counts, sort by frequency/recency, top 8 pinned with an "All tags" list.
- Render a skeleton or an em dash for the count while loading; never "0 notes" with 49 notes.
- Make search sticky; let the list own the viewport.
- Consider "All notes" as an explicit reset, not only clicking the selected tag again.

**Effort:** M. **Roadmap:** Phase 5 "Nav simplification / unify page shell" — add the tag treatment explicitly.

---

### 7. Paginate or load more

The API supports `limit`/`offset`, but the UI requests 50 notes, 50 digests, 50 ask-history items, and 100 vinyl records with no "load more" and no indication of truncation (`NotesPanel.tsx:65-74`, `NotesList.tsx:34`, `summaries.tsx:32-33`, `VinylLibrary.tsx:46`). With 49 notes today, the default browse view is one note away from silently hiding older content.

**Recommendation:** Add "Load more" (or intersection-observer infinite scroll) to notes, digests, ask history, and vinyl. Show "Showing 50 of 128" near the count. Add `j/k` navigation and bulk selection while the list is being touched.

**Effort:** M. **Roadmap:** Phase 5.

---

### 8. Make the dashboard a daily home, and make first-run intentional

Today the dashboard is four counts and five todos. It does not show recent captures, today's meals, the record that is playing, or the AI's latest filing decisions. A new account lands on a page of zeros with no "record your first note" moment. There is no onboarding route or checklist.

**Recommendation:**

- **First-run:** a small, dismissible checklist — Record a note · Try Ask · Log a meal · Add a record — with a one-tap "Try a sample note" so the AI value is visible before the user commits personal data.
- **Returning user:** a "Today" block with recent captures across domains, today's meals, active todos, and one AI insight ("3 new tasks found in 2 notes").
- Add a weekly digest card that links into Summaries instead of making the user remember to generate one.
- Give the dashboard a capture bar that accepts type/record/upload without leaving the page.

**Effort:** M–L. **Roadmap:** Phase 7 "Useful daily note/home surface"; pull the first-run checklist forward.

---

### 9. Give Meals a non-voice path and a date intent

`MealRecorder` only offers "Start Recording" (`MealRecorder.tsx:82-106`). `transcribeMeal` sends no date (`frontend/src/lib/api/meals.ts:82-90`), so the backend infers a date from the transcript or defaults to today. The day slide-over's empty state says "Record a meal to see it here" but provides no action (`DayMealsSlideOver.tsx:104-111`); users must close it, record, then edit the date.

**Recommendation:**

- Add a "Speak / Type / Photo" segmented control. Typed entry can go through the same extractor or a simple item list.
- Add a date picker to capture, defaulting to today; show it in the record panel as "Logging for: Today".
- In the day slide-over, add "Add a meal for this day" that opens the capture panel with the date prefilled.
- Add a "Today" jump and a week strip to the calendar; keep the month grid for browsing.

**Effort:** M. **Roadmap:** not listed — add to Phase 5/7.

---

### 10. Make Ask trustworthy: hide the machinery, show the sources

`AskSlideOver` puts "Derived filters" and "Semantic query" above the answer (`AskSlideOver.tsx:142-187`), which reads like a debug console. Ask history citations render as `Note a1b2c3d4` because only IDs are stored (`summaries.tsx:306-329`), while live Ask results show note titles. The answer has no copy action, no "open all sources", and a long indeterminate "Planning + searching + summarizing…" state with no cancel.

**Recommendation:**

- Replace the machinery block with a human meta line: "Searched 12 notes · February · #food". Put the JSON/plan under a `Disclosure` labelled "How this answer was made".
- Persist note titles (or fetch them) for history and show the same source cards as the live answer.
- Add "Copy answer", "Open source", and "Ask a follow-up" in the result footer.
- Show progress stages ("Planning → Searching 12 notes → Writing") and allow cancel.
- Make `⌘Enter` submit.
- Stop showing `Math.round(rank * 100)%` as if it were a probability. Note search uses FTS `ts_rank_cd`, Ask uses a retrieval score, and todos use a model confidence; only the last is a calibrated confidence. Label the first two as "match" or hide the number.

**Effort:** M. **Roadmap:** Phase 7 citations, but the UI cleanup can ship now.

---

### 11. Make sharing contextual and reversible

Sharing is surfaced as a tiny top-right "Share Calendar" text link, a Vinyl "Share" button, and the Friends → Sharing tab. There is no "Shared with me" inbox outside that tab, and friend removal is a single unconfirmed click (`FriendsList.tsx:157-165`). The pending badge only counts friend requests and received shares.

**Recommendation:**

- Put Share in each page header with the resource already selected (see P0 #4), plus a "Shared with 2 people" indicator near the page title.
- Add a global "Shared with me" section or a notification entry point; deep-link accepted shares into the actual calendar/library.
- Confirm friend removal, and offer Undo for removal/revoke rather than a native dialog.

**Effort:** M. **Roadmap:** Phase 5/6.

---

## P2 — Consistency, accessibility, and polish

### Copy and data correctness

- **"1 records · 1 artists"** on Vinyl (`VinylLibrary.tsx:63-66`). Pluralize.
- **"OpenAI Whisper"** on the landing page (`frontend/src/routes/index.tsx:111`); the product now uses `gpt-transcribe`, and the README explicitly says the Whisper family is being retired.
- **Date formats drift:** notes use "Nov 14, 5:34 PM"; summaries use "11/13/2026, 3:44:02 PM". Standardize on the note format.
- **Page-header drift:** Dashboard/Settings/Todos/Vinyl/Summaries/Friends use `PageHeader`; Notes uses a hand-rolled "Your Notes" heading and Meals has no page heading at all. The app header also repeats the page title (`Notes` in header + `Your Notes` + tab `Notes`). Pick one title treatment per page.
- **Mixed save models in Settings:** Auto-accept saves immediately (`settings.tsx:79-83`), Discoverable requires "Save changes" (`settings.tsx:194-208`), and Preferred languages has its own Save. Users cannot predict what persists.
- **ISO codes for languages** ("en, es, fr") is developer language. Use a named multi-select with autodetect as the default.

### Visual-system drift

- The design doc says "Keep icon SVGs out of feature code — use lucide" and "Details on demand", but there are **50 inline `<svg>` occurrences across 17 feature files** and emoji used as icons: 🏷️ (tags), 📅 (meals quick view), 🌅/☀️/🌙/🍿 (meal types), 🍽️ (empty day), 💿/🔍 (vinyl empty), 🐛/💡/💬 (feedback). They render differently per OS and break the quiet visual language. Replace with one icon set and one empty-state illustration language.
- **Loading states are inconsistent:** some pages use skeletons (`NotesList`), some a large spinner (`QueryStateRenderer`), some plain text ("Loading collection…", "Loading todos…"). Prefer skeletons for lists and reserve spinners for actions.
- **PWA assets are incomplete:** `site.webmanifest` lists only a 180×180 icon, with no 192/512 or maskable icon, and there is no service worker. If "mobile quick capture everywhere" is a goal, add installability and an offline capture queue. The favicon is also an emoji (🐺), which will look inconsistent with a polished brand.

### Accessibility and touch

- Todo completion is an 18px circle (26px including the pseudo-element) and delete is 28px (`TodoItem.tsx:47-60`, `111-124`); header icon buttons are 32px. Aim for 44×44 CSS px on touch.
- Tag pills have no `aria-pressed`; selected state is only color (`TagCloud.tsx:38-49`).
- The command palette's `DialogTitle`/`DialogDescription` are outside `DialogContent` (`command.tsx:44-51`), which is fragile for `aria-labelledby`; put the header inside the content or use a proper `aria-label`.
- No skip-to-content link before the nine nav items.
- `Window.confirm`/`alert` are used **18 times across 5 files** (notes, todos, meals, summaries, ask). They block the UI, look foreign on mobile, and cannot be styled or undone.

### Todos

- AI-extracted todos cannot be edited, even though `PUT /api/todos/<id>` exists. A user who gets a badly worded task can only accept/complete/delete it. Add inline edit for title/description and "Dismiss" wherever suggested todos appear.
- Manual todo creation only asks for a title; the API accepts a description too. Add an optional detail field, and consider due dates/priority only if the user asks — right now tasks have no time dimension at all.

### Error and empty states

- `FriendsList` has no error branch; a failed friends query shows "No friends yet" (`FriendsList.tsx:49-57`). Same pattern in `ShareManager` ("Nothing here yet" on error).
- Empty states often explain mechanics instead of offering the next action. "No digests yet" tells the user to generate a summary but gives no button; "No meals logged" says to record a meal but gives no action.
- The notes empty state says "Use the Record / Upload or Write tab in the Capture panel," but on mobile the tabs are "Capture" and "Notes"; make these real buttons that switch tabs.

---

## The bigger opportunity

The app currently has five excellent recorders and a thin cross-domain layer. The roadmap's thesis is stronger: **capture once, let AI file it, retrieve it with confidence.** The interface should show that loop.

A possible north-star structure:

1. **Today** — one capture bar, recent captures across domains, today's meals, active todos, one insight.
2. **Library** — a single reverse-chronological timeline with type filters and the unified search; notes/meals/vinyl are filters, not separate silos.
3. **Ask** — the retrieval surface, with citations and history, not a slide-over bolted onto the header.
4. **Friends**, **Settings** — secondary.

This would also make the landing promise ("Everything in one place"; "Find anything across your notes, meals, and collection") true. It is a bigger bet than the fixes above, so treat it as a design direction, not a week-one refactor.

A smaller, distinctive bet: lean into **vinyl as a signature experience** rather than a utility grid — "now spinning", listening notes, a record's linked notes, and a shareable shelf. It is the most emotionally resonant domain in the product and currently gets the least product thinking.

---

## Suggested sequence

### Week 1 — correctness and trust
1. Parse digest JSON (#3).
2. Pass share resource context (#4).
3. Add the dirty-edit guard/autosave (#2).
4. Fix "1 records", "Whisper", count flash, and page-header/copy drift.
5. Replace the worst `confirm()` calls with an in-app dialog + Undo toast.

### Week 2 — retrieval and limits
6. Unified `⌘K` search with grouped results (#1).
7. Usage card + humanized 429 + 80% warning (#5).
8. Ask: hide internals, show titles in history, copy answer (#10).

### Week 3 — density and flow
9. Notes filter toolbar, tag popover, skeletons, pagination (#6, #7).
10. Contextual share + shared-with-me + friend-removal confirmation (#11).
11. Meals: type/photo path, date picker, add-from-day (#9).

### Week 4 — activation and mobile
12. First-run checklist + sample note (#8).
13. Dashboard "Today" block (#8).
14. PWA 192/512/maskable icons and an offline capture queue.
15. Accessibility sweep: 44px targets, `aria-pressed`, skip link, dialog labeling.

---

## Measurement

There is no product analytics in the frontend today. To know whether these changes work, instrument:

- `signup_completed` → `first_note_created` (activation rate and time-to-first-note).
- `search_opened` → `search_result_opened` (search success rate), split by command vs content.
- `ask_submitted` → `citation_opened` (answer trust).
- `quota_warning_shown` / `quota_429` (how often limits surprise users).
- `note_edit_started` → `note_edit_closed` (dirty-close rate; target zero losses).
- `share_created` with resource type (catch wrong-resource shares).

---

## Method and evidence

- Reviewed the live production build at `chisos.xyz` while signed in, on desktop (1456×756) and mobile emulation (390×844, DPR 2, touch).
- Exercised Dashboard, Notes list/detail/edit, global search, Summaries, Todos, Meals (record + calendar + day), Vinyl, Friends, Settings, and the command palette.
- Inspected the relevant React components, hooks, API client, design tokens, manifest, and the quota/usage routes.
- Measured text contrast from the OKLCH tokens (AA checks noted above).
- Live screenshots contain personal data and were intentionally not committed to `docs/assets`.

---

## What I would do first, in one sentence

Fix the four defects that make the product feel unreliable — content search, unsaved edits, raw digest JSON, and wrong-resource sharing — then spend the next sprint making the AI's organization and limits visible, because that is the trust layer the rest of the product depends on.
