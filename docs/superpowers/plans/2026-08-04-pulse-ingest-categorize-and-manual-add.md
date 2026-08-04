# Categorize-on-ingest + Notify, and Manual Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify + let the user categorize each auto-ingested transaction, and add a manual "+ Add" entry button (with a back-datable date field on money entries).

**Architecture:** Reuse-heavy, no new infra. The ingest route sends a per-entry pull-on-push notification whose URL deep-links to the entry's category picker. A "+ Add" button opens a blank `ConfirmationChip` for the active tab's kind. The money chip gains a date field, and `updateEntry` persists `occurred_at` so entries can be re-dated on edit.

**Tech Stack:** Next 16 / React 19 / TypeScript, Vitest, Kysely + D1, Dexie, existing Web Push (VAPID + `push_notifications` + `sendPushToUser`).

## Global Constraints

- No new dependency, migration, cron, or `entity_kind`; `push_notifications` + VAPID infra already exist.
- Notifications fire ONLY on the ingest route's `added:true` path — never on `added:false` (dedup / non-transaction), never on `dryRun`, never for manual/voice/receipt entries.
- Push failure must NOT fail ingest (wrap in try/catch; the entry is already created → still return `added:true`).
- Money `source` for manual add is `'manual'` (already in the enum). All four payload `source` enums include `'manual'`.
- Money date field: `type="date"`, value `occurred_at.slice(0,10)`, on change set `occurred_at` to **noon-local** (`new Date(v + 'T12:00:00').toISOString()`); shown in BOTH create and edit.
- The Dexie money table accessor is `db.money_entries`.
- Presentational/integration changes (chip, page.tsx, money-list) have NO render-test harness in this repo → verified by `pnpm exec tsc --noEmit` + `pnpm build` + the QA runbook. Do NOT fabricate render tests.
- Merging to `main` auto-deploys; verify CI + Deploy both green + prod HTTP 200.
- git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`. Run tests: `pnpm test`; typecheck: `pnpm exec tsc --noEmit`.

---

### Task 1: `ingestNotification` pure helper

**Files:**
- Create: `src/lib/ingest-notification.ts`
- Test: `tests/lib/ingest-notification.test.ts`

**Interfaces:**
- Produces: `ingestNotification(p: { amount: number; currency: string; direction: 'in'|'out'; description: string | null }, entityId: string): { title: string; body: string; url: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ingest-notification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ingestNotification } from '@/lib/ingest-notification'

describe('ingestNotification', () => {
  it('formats an outgoing INR transaction with a merchant', () => {
    const n = ingestNotification({ amount: 47500, currency: 'INR', direction: 'out', description: 'Crunchyroll' }, 'sms-abc')
    expect(n.title).toBe('💳 ₹475 · Crunchyroll')
    expect(n.body).toBe('Tap to set a category')
    expect(n.url).toBe('/app?categorize=sms-abc')
  })

  it('marks income with 💰 and a + sign, no description', () => {
    const n = ingestNotification({ amount: 200000, currency: 'INR', direction: 'in', description: null }, 'sms-x')
    expect(n.title).toBe('💰 +₹2,000')
  })

  it('does not divide JPY by 100', () => {
    const n = ingestNotification({ amount: 500, currency: 'JPY', direction: 'out', description: null }, 'sms-y')
    expect(n.title).toBe('💳 ¥500')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ingest-notification`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/ingest-notification.ts`:

```ts
import { currencySymbol } from '@/lib/currency'

/** Build the pull-on-push notification for an auto-ingested transaction. */
export function ingestNotification(
  p: { amount: number; currency: string; direction: 'in' | 'out'; description: string | null },
  entityId: string,
): { title: string; body: string; url: string } {
  const major = (p.amount / (p.currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(p.currency)
  const icon = p.direction === 'out' ? '💳' : '💰'
  const sign = p.direction === 'out' ? '' : '+'
  const desc = p.description ? ` · ${p.description}` : ''
  return {
    title: `${icon} ${sign}${symbol}${major}${desc}`,
    body: 'Tap to set a category',
    url: `/app?categorize=${entityId}`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ingest-notification`
Expected: PASS. (If `currencySymbol('INR')` is not `₹` or `currencySymbol('JPY')` is not `¥`, adjust the test's expected symbols to match `src/lib/currency.ts` — read it and use the real symbols; the logic is what matters.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest-notification.ts tests/lib/ingest-notification.test.ts
git commit -m "feat: ingestNotification pure helper for auto-ingest push"
```

---

### Task 2: `blankDraftForKind` pure helper

**Files:**
- Create: `src/lib/blank-draft.ts`
- Test: `tests/lib/blank-draft.test.ts`

**Interfaces:**
- Consumes: `ChipDraft` from `@/components/confirmation-chip`.
- Produces: `blankDraftForKind(kind: 'money'|'task'|'learning'|'note', primaryCurrency: string, nowIso: string): ChipDraft`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/blank-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { blankDraftForKind } from '@/lib/blank-draft'

const NOW = '2026-08-04T10:00:00.000Z'

describe('blankDraftForKind', () => {
  it('money: zero amount, primary currency, out, manual, dated now', () => {
    const d = blankDraftForKind('money', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'money', amount: 0, currency: 'INR', direction: 'out', category_id: null, description: null, occurred_at: NOW, source: 'manual' })
  })
  it('task: empty title, medium, empty tags, manual', () => {
    const d = blankDraftForKind('task', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'task', title: '', priority: 'medium', tags: [], due_at: null, project_id: null, source: 'manual' })
  })
  it('learning: empty text, manual, dated now', () => {
    const d = blankDraftForKind('learning', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'learning', text: '', tags: [], attribution: null, occurred_at: NOW, source: 'manual' })
  })
  it('note: empty body, null title, manual, dated now', () => {
    const d = blankDraftForKind('note', 'INR', NOW)
    expect(d).toMatchObject({ kind: 'note', body: '', title: null, tags: [], occurred_at: NOW, source: 'manual' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- blank-draft`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/blank-draft.ts`:

```ts
import type { ChipDraft } from '@/components/confirmation-chip'
import type { Currency } from '@/lib/op-schemas/money'

/** A blank ConfirmationChip draft for manual "+ Add" — kind decided by the active tab. */
export function blankDraftForKind(
  kind: 'money' | 'task' | 'learning' | 'note',
  primaryCurrency: string,
  nowIso: string,
): ChipDraft {
  switch (kind) {
    case 'task':
      return { kind: 'task', title: '', due_at: null, priority: 'medium', tags: [], project_id: null, source: 'manual', raw_input: null }
    case 'learning':
      return { kind: 'learning', text: '', tags: [], attribution: null, occurred_at: nowIso, source: 'manual' }
    case 'note':
      return { kind: 'note', body: '', title: null, tags: [], occurred_at: nowIso, source: 'manual' }
    case 'money':
    default:
      return { kind: 'money', amount: 0, currency: primaryCurrency as Currency, direction: 'out', category_id: null, description: null, occurred_at: nowIso, source: 'manual', raw_input: null }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- blank-draft`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blank-draft.ts tests/lib/blank-draft.test.ts
git commit -m "feat: blankDraftForKind pure helper for manual add"
```

---

### Task 3: Ingest route sends a per-entry categorize push

**Files:**
- Modify: `src/app/api/ingest/sms/route.ts`
- Test: `tests/api/ingest-sms-route.test.ts`

**Interfaces:**
- Consumes: `ingestNotification` (Task 1); `sendPushToUser(db, { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY }, userId)` from `@/lib/web-push`.

- [ ] **Step 1: Write the failing tests + extend the fake DB**

In `tests/api/ingest-sms-route.test.ts`:

(a) Add a `pushRows` array next to `opLog` (near the top, after `const opLog: Row[] = []`):
```ts
const pushRows: Row[] = []
```

(b) Make the fake DB's `insertInto` table-aware — replace the existing `insertInto` in `makeFakeDb` with:
```ts
    insertInto: (table: string) => ({
      values: (v: Row) => {
        const r: any = { execute: async () => { (table === 'push_notifications' ? pushRows : opLog).push(v) }, onConflict: () => r }
        return r
      },
    }),
```

(c) Add a web-push mock (next to the other `vi.mock` calls):
```ts
const sendPushMock = vi.fn(async () => ({ sent: 1, pruned: 0 }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: (...a: unknown[]) => sendPushMock(...a) }))
```

(d) Reset both in `beforeEach` (add to the existing body):
```ts
    pushRows.length = 0
    sendPushMock.mockClear()
```

(e) Add these tests inside `describe('POST /api/ingest/sms', ...)`:
```ts
  it('sends ONE categorize push on a new ingest (added:true)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    const res = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL', 'email'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(pushRows).toHaveLength(1)
    expect(String(pushRows[0].url)).toContain('categorize=')
    expect(String(pushRows[0].title)).toContain('CRUNCHYROLL')
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT push for a non-transaction (added:false)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: false })
    await POST(reqS(goodToken, 'Your OTP is 1234', 'email'))
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('does NOT push on a dedup re-POST', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL dup', 'email'))
    sendPushMock.mockClear(); pushRows.length = 0
    const res2 = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL dup', 'email'))
    expect((await res2.json() as { added: boolean }).added).toBe(false)
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('does NOT push in dryRun', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    const dry = new Request('http://x/api/ingest/sms', {
      method: 'POST',
      headers: { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Rs.475 spent CRUNCHYROLL dry', source: 'email', dryRun: true }),
    })
    await POST(dry)
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('still returns added:true when the push send throws', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    sendPushMock.mockRejectedValueOnce(new Error('push down'))
    const res = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL boom', 'email'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- ingest-sms-route`
Expected: FAIL — the route does not insert push rows or call `sendPushToUser` yet.

- [ ] **Step 3: Implement the route change**

`src/app/api/ingest/sms/route.ts`:

(a) Add imports near the top:
```ts
import { ingestNotification } from '@/lib/ingest-notification'
import { sendPushToUser } from '@/lib/web-push'
```

(b) Widen the `cfEnv` cast (the `const cfEnv = env as {...}` line):
```ts
  const cfEnv = env as { DB: D1Database; GROQ_API_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }
```

(c) Immediately BEFORE the final `return NextResponse.json({ ok: true, added: true })`, insert:
```ts
  // Per-entry categorize push (added:true path only — never dedup/non-txn/dryRun).
  // Best-effort: a push failure must not fail the ingest, the entry already exists.
  try {
    const note = ingestNotification(
      { amount: payload.amount, currency: payload.currency, direction: payload.direction, description: payload.description ?? null },
      op.entity_id,
    )
    await db.insertInto('push_notifications').values({
      id: `ingest-${op.id}`, user_id: userId,
      title: note.title, body: note.body, url: note.url,
      created_at: nowIso, read_at: null,
    }).onConflict(oc => oc.column('id').doNothing()).execute()
    await sendPushToUser(db, { VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY }, userId)
  } catch (err) {
    console.error('sms-ingest push failed', err)
  }
```

(The `dryRun` early-return already sits above the op-write, so this block is unreachable in dry-run; `added:false` also returns earlier.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- ingest-sms-route`
Expected: PASS — all new push tests plus the pre-existing route tests (bad token, creates op, non-transaction, idempotent, source, clip, 503, dryRun) still green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ingest/sms/route.ts tests/api/ingest-sms-route.test.ts
git commit -m "feat: ingest route sends a per-entry categorize push on added:true"
```

---

### Task 4: Money chip date field + persist occurred_at on edit

**Files:**
- Modify: `src/components/confirmation-chip.tsx` (`ConfirmationChipMoney`)
- Modify: `src/app/app/page.tsx` (`updateEntry` money case)

**Interfaces:**
- Consumes: `MoneyPayload.occurred_at` (already on the money draft).

**Note:** presentational + a non-exported handler → no unit test (no render harness). Verify with `pnpm exec tsc --noEmit`.

- [ ] **Step 1: Add the date field to `ConfirmationChipMoney`**

In `src/components/confirmation-chip.tsx`, widen the `editingField` state union to include `'date'`:
```ts
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category' | 'date'>(null)
```

Then, immediately AFTER the category/description `<div className="mb-3 flex flex-wrap items-center gap-1.5">…</div>` block (the one containing the category button + description) and BEFORE the `{editingField === 'category' && (…)}` block, insert a date row:
```tsx
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {editingField === 'date' ? (
          <Input
            autoFocus
            type="date"
            defaultValue={d.occurred_at.slice(0, 10)}
            onBlur={(e) => {
              const v = e.currentTarget.value
              if (v) setD(s => ({ ...s, occurred_at: new Date(v + 'T12:00:00').toISOString() }))
              setEditingField(null)
            }}
            className="h-7 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('date')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            📅 {d.occurred_at.slice(0, 10)}
          </button>
        )}
      </div>
```
(No `isEdit` guard — the date field shows in both create and edit.)

- [ ] **Step 2: Persist occurred_at on edit**

In `src/app/app/page.tsx`, `updateEntry`, the `case 'money':` payload — add `occurred_at`:
```ts
      case 'money':
        entity_kind = 'money'
        payload = { amount: final.amount, currency: final.currency, direction: final.direction, category_id: final.category_id ?? null, description: final.description ?? null, occurred_at: final.occurred_at }
        break
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/confirmation-chip.tsx src/app/app/page.tsx
git commit -m "feat: back-datable date field on the money chip (create + edit)"
```

---

### Task 5: "+ Add" button + deep-link categorize

**Files:**
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `blankDraftForKind` (Task 2); `moneyRowToDraft` (already imported); `db.money_entries.get`.

**Note:** presentational/integration → no unit test. Verify with `pnpm exec tsc --noEmit` + `pnpm build`.

- [ ] **Step 1: Imports + hooks**

In `src/app/app/page.tsx`:
(a) Add to the `next/navigation` import: `useSearchParams`:
```ts
import { useRouter, useSearchParams } from 'next/navigation'
```
(b) Add the blank-draft import:
```ts
import { blankDraftForKind } from '@/lib/blank-draft'
```
(c) Inside `AppPageInner`, add the prefs hook + searchParams (near the other hooks, after `const [activeTab, setTab] = useTabState()`):
```ts
  const { prefs } = useUserPrefs()
  const searchParams = useSearchParams()
```
(`useUserPrefs` is already imported.)

- [ ] **Step 2: Deep-link categorize effect**

Add this effect inside `AppPageInner` (e.g. right after the `seed/dedupe` effect):
```ts
  // Deep-link from an ingest push: /app?categorize=<id> → open that money entry's
  // edit chip (category picker) on the Money tab, then strip the param. Runs once
  // per id; never clobbers an already-open draft.
  const categorizeHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    const cid = searchParams.get('categorize')
    if (!cid || categorizeHandledRef.current === cid) return
    categorizeHandledRef.current = cid
    let cancelled = false
    ;(async () => {
      const row = await db.money_entries.get(cid)
      if (cancelled) return
      setTab('money')
      if (row && !draftOpenRef.current) { setEditId(cid); setDraft(moneyRowToDraft(row)) }
      router.replace('/app?tab=money')
    })()
    return () => { cancelled = true }
  }, [user, searchParams, router, setTab])
```
Add a ref that mirrors whether a draft is open (so the async closure reads the latest value), placed near the other refs:
```ts
  const draftOpenRef = useRef(false)
  useEffect(() => { draftOpenRef.current = draft !== null }, [draft])
```

- [ ] **Step 3: "+ Add" button in the capture bar**

In the capture-bar row, inside the left `<div className="flex items-center gap-2">` (which holds `VoiceRecorder` + `ReceiptButton`), add after the `ReceiptButton`:
```tsx
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Add an entry manually"
                disabled={draft !== null || parsing || queryPlan !== null}
                onClick={() => {
                  const tabKind = activeTab === 'tasks' ? 'task' : activeTab === 'notes' ? 'note' : activeTab === 'learning' ? 'learning' : 'money'
                  setDraft(blankDraftForKind(tabKind, prefs.primary_currency ?? 'INR', new Date().toISOString()))
                }}
              >
                + Add
              </Button>
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit` (expect exit 0), then `pnpm build` (expect success; `/app` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: + Add manual-entry button + ingest categorize deep-link"
```

---

### Task 6: "Set category" pill on uncategorized auto-fetched rows

**Files:**
- Modify: `src/components/money-list.tsx`

**Interfaces:**
- Consumes: `onEdit` prop (already exists); `MoneyEntryRow.category_id` / `.source`.

**Note:** presentational → verify with `pnpm exec tsc --noEmit`.

- [ ] **Step 1: Add the pill**

In `src/components/money-list.tsx`, inside the metadata row `<div className="mt-1 flex flex-wrap items-center gap-2">`, AFTER the `{e.source === 'email' && (…)}` badge block, add:
```tsx
                    {!e.category_id && (e.source === 'email' || e.source === 'sms') && onEdit && (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); onEdit(e) }}
                        aria-label={`Set category for ${e.description || formatAmount(e)}`}
                        className="text-[10px] border border-amber-400/40 text-amber-400 rounded-full px-1.5 py-0.5 hover:bg-amber-400/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        ⚠ Set category
                      </button>
                    )}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/money-list.tsx
git commit -m "feat: Set-category pill on uncategorized auto-fetched money rows"
```

---

### Task 7: QA runbook

**Files:**
- Create: `docs/superpowers/notes/2026-08-04-pulse-categorize-manual-add-qa-runbook.md`

- [ ] **Step 1: Write the runbook**

Create the file:
```markdown
# Categorize-on-ingest + Manual Add — QA Runbook (on-device)

## Categorize + notify on ingest
1. Ensure notifications are enabled (Settings → Preferences → enable; verify with "Send test notification").
2. Trigger a bank email/SMS ingest (or run the Apps Script). A new 📧/💳 entry appears with no category.
3. A push arrives: "💳 ₹<amt> · <merchant> — Tap to set a category".
4. Tap it → app opens the Money tab with that entry's edit chip → pick a category → Save. The row now shows the category.
5. Without tapping the push: the uncategorized auto-fetched row shows a "⚠ Set category" pill → tap → same edit chip.
6. A dedup re-POST or a non-transaction email → NO push (only real new entries notify).

## Manual add
7. On the Money tab, tap "+ Add" → a blank transaction form opens (amount 0, out, no category).
8. Set amount/category/description, tap the 📅 date to back-date, flip in/out → Confirm → the entry is created with source manual on the picked date.
9. On the Tasks/Learn/Notes tabs, "+ Add" opens a blank task/learning/note form respectively.
10. Long-press an existing money entry → Edit → change the 📅 date → Save → the entry's date updates (back-dating on edit).

## Notes
- No migration/cron/dep/new entity_kind — reuses push_notifications + sendPushToUser + the ConfirmationChip.
- Push is best-effort: if the send fails the entry is still created (added:true); the in-app pill is the fallback.
- Date field constructs occurred_at as noon-local on the picked date to avoid a UTC date-boundary shift.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-08-04-pulse-categorize-manual-add-qa-runbook.md
git commit -m "docs: QA runbook for categorize-on-ingest + manual add"
```

---

## After all tasks

- Run full `pnpm test` + `pnpm build` — both green.
- Whole-branch review (opus), then finishing-a-development-branch → merge `ingest-categorize-manual-add` to `main` (auto-deploys).
- Verify CI + "Deploy to Cloudflare Workers" both green + prod HTTP 200.
- Owner follow-up (device): trigger an ingest → confirm the push + tap-to-categorize + the pill; try "+ Add" on each tab; back-date a manual entry and an edited entry.
```
