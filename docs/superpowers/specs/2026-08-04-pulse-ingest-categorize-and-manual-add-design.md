# Pulse — Categorize-on-ingest + Notify, and Manual Add (design)

**Date:** 2026-08-04
**Status:** approved for planning

## Problem

Two gaps surfaced once email auto-ingest started working:
1. Auto-fetched transactions land with **no category** (`category_id: null`) and no signal — Sheik wants a **push notification** per fetched transaction plus a fast way to **pick its category**.
2. There is no **manual** way to add an entry — only voice (mic) or NL typing. Sheik wants a structured "add entry" form, including the ability to **back-date** it.

## Goals

- **Feature 1 — Categorize + notify on ingest:** when `/api/ingest/sms` creates a new money entry, send a per-entry push ("💳 ₹475 · Crunchyroll — tap to set a category"); tapping opens that entry's category picker; uncategorized auto-fetched rows also carry an in-app "Set category" affordance.
- **Feature 2 — Manual add:** a **+ Add** button in the capture bar opens a blank `ConfirmationChip` for the active tab's kind, with `source:'manual'`; add a **date field** to the money chip so manual entries can be back-dated (and existing money entries re-dated on edit).

## Non-goals (YAGNI)

- AI category-guessing on ingest (Sheik picks the category).
- A kind-picker for manual add (the active tab decides the kind).
- Batched / digest notifications (per-entry was chosen).
- Date fields on task/learning/note chips (task already edits `due_at`; money is the one that needs `occurred_at`).
- No new `entity_kind`, migration, cron, or dependency — everything reuses existing infrastructure.

## Architecture

Both features are reuse-heavy. Existing pieces they build on:
- **Push:** pull-on-push — insert a `push_notifications` row (`title/body/url`) then call `sendPushToUser(db, vapidEnv, userId)` (`src/lib/web-push.ts`); the service worker wakes, pulls pending rows, and shows them; the row's `url` is the click target. VAPID secrets already exist (used by crons).
- **Chip:** `ConfirmationChip` (`draft` + `mode:'create'|'edit'`) already renders a full money form (amount/category/description/direction) and, for tasks, a `datetime-local` field — the pattern the money date field mirrors.
- **Orchestration (`app/page.tsx`):** `setDraft({kind,…})` opens the chip; `editId` + `moneyRowToDraft` drives edit mode; `confirmEntry` (create) and `updateEntry` (update op) already exist; `useTabState` gives the active tab; row anchors are `#pulse-row-<id>`.

### Feature 1 data flow

```
Apps Script → POST /api/ingest/sms → parse → smsToMoneyPayload → op (added:true)
   → INSERT push_notifications { title, body, url:/app?categorize=<entityId> }
   → sendPushToUser(db, {VAPID_*}, userId)        [only on added:true]
        ↓ (device wakes, SW pulls + shows)
   tap → /app?categorize=<id> → app switches to Money tab, opens the entry's edit
         chip with the category picker → pick → Save = existing updateEntry op
```
In-app, uncategorized auto-fetched rows (`!category_id && source ∈ {email,sms}`) render a `⚠ Set category` pill that calls the existing `onEdit(row)` → same edit chip.

### Feature 2 data flow

```
+ Add (capture bar) → setDraft(blankDraftForKind(tabKind, primaryCurrency, now))
   → ConfirmationChip (create mode, source:'manual') → Confirm → existing create path
Money chip: a date field bound to d.occurred_at (create + edit); on edit, updateEntry
   now includes occurred_at so the re-date persists.
```

## Components

### New pure helpers (unit-tested)

**`src/lib/ingest-notification.ts`** — `ingestNotification(p: { amount: number; currency: string; direction: 'in'|'out'; description: string | null }, entityId: string) → { title: string; body: string; url: string }`.
- title: `${direction==='out' ? '💳' : '💰'} ${direction==='out' ? '' : '+'}${symbol}${major}${description ? ' · ' + description : ''}` (major = amount/100, JPY = whole).
- body: `Tap to set a category`.
- url: `/app?categorize=${entityId}`.

**`src/lib/blank-draft.ts`** — `blankDraftForKind(kind: 'money'|'task'|'learning'|'note', primaryCurrency: string, nowIso: string) → ChipDraft`.
- money → `{ kind:'money', amount:0, currency: primaryCurrency, direction:'out', category_id:null, description:null, occurred_at: nowIso, source:'manual', raw_input:null }`
- task → `{ kind:'task', title:'', due_at:null, priority:'medium', tags:[], project_id:null, source:'manual', raw_input:null }`
- learning → `{ kind:'learning', text:'', tags:[], attribution:null, occurred_at: nowIso, source:'manual' }`
- note → `{ kind:'note', body:'', title:null, tags:[], occurred_at: nowIso, source:'manual' }`

### Modified files

**`src/app/api/ingest/sms/route.ts`** — on the `added:true` path only (after `materializeRow`), build `ingestNotification(payload, op.entity_id)`, insert a `push_notifications` row (`id: 'ingest-' + op.id`, `user_id`, `title`, `body`, `url`, `created_at`, `read_at:null`), then `sendPushToUser(db, { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY }, userId)`. Widen `cfEnv` typing to include the two VAPID vars. Push failure must NOT fail ingest (wrap in try/catch → log; the entry is already created). Do NOT notify on `added:false` (dedup/non-transaction) or in `dryRun`.

**`src/components/confirmation-chip.tsx`** (`ConfirmationChipMoney`) — add a date field mirroring the task `due_at` pattern: a `type="date"` input whose value is `d.occurred_at.slice(0,10)`; onChange sets `occurred_at` to **noon-local** on the picked date (`new Date(value + 'T12:00:00').toISOString()`) to avoid a UTC date-boundary shift. Shown in BOTH create and edit modes, labelled `📅 <date>` / tap to change. No other chip variant changes.

**`src/app/app/page.tsx`** —
- **+ Add button:** in the capture-bar row, add a `+ Add` button (disabled while a draft/parse/query is active) that calls `setDraft(blankDraftForKind(tabKind, prefs.primary_currency ?? 'INR', new Date().toISOString()))`, where `tabKind` maps `activeTab` (`money→money, tasks→task, learning→learning, notes→note`).
- **Deep-link categorize:** a mount effect reads `useSearchParams().get('categorize')`; if present, `setTab('money')`, `db.money.get(id)` → if found, `setEditId(id) + setDraft(moneyRowToDraft(row))`; then strip the `categorize` param (`router.replace('/app?tab=money')`). Guarded so it runs once and never clobbers an open draft.
- **updateEntry money payload:** add `occurred_at: final.occurred_at` to the money `case` (so re-dating persists on edit). All other kinds unchanged.

**`src/components/money-list.tsx`** — for a row with `!e.category_id && (e.source === 'email' || e.source === 'sms')`, render a `⚠ Set category` pill (in the existing metadata row) that calls `onEdit?.(e)`. Presentational.

## Error handling

- **Push send fails / no subscription:** logged; ingest still returns `added:true` (the entry exists; the in-app pill remains the fallback). Never turns a successful ingest into an error.
- **Deep-link entry missing** (deleted before tap, or not yet synced): the effect no-ops (no chip) and clears the param; the row will appear after sync and can be categorized via the pill.
- **Back-date field:** an empty/invalid date leaves `occurred_at` unchanged.

## Testing

- **`ingest-notification.test.ts`:** out vs in formatting, JPY (no ÷100), null description, url carries the entity id.
- **`blank-draft.test.ts`:** each kind returns the right blank shape with `source:'manual'` and the passed currency/nowIso.
- **`ingest-sms-route.test.ts`:** on `added:true` a `push_notifications` row is inserted (title/url contain the entity) and `sendPushToUser` (mocked) is called once; on `added:false` (dedup / non-transaction) and `dryRun`, NEITHER happens; a thrown `sendPushToUser` still returns `added:true`.
- Deep-link handler, + Add button, money date field, and the "Set category" pill are presentational/integration (no render harness in this repo) → verified by `pnpm build` + the QA runbook.
- Full `pnpm test` + `pnpm build` green.

## Global constraints

- No new dependency, migration, cron, or `entity_kind`; `push_notifications` + VAPID infra already exist.
- Notifications fire ONLY for auto-ingested entries (email/SMS), never for manual/voice/receipt.
- Money `source` for manual add is `'manual'` (already in the enum).
- Local-first op-log + per-field HLC LWW; create via `confirmEntry`, update via `updateEntry` (unchanged mechanics).
- Merging to `main` auto-deploys; verify CI + Deploy green + prod HTTP 200.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
