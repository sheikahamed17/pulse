# Swipe-to-reveal Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A swipe-left-to-reveal-Delete gesture on every row of the four entity lists (money / task / learning / notes), confirmed by tapping the revealed button.

**Architecture:** A pure `swipeReducer` (all gesture math, unit-tested) + a `<SwipeRow>` wrapper component that owns the pointer stream, the 500ms long-press timer, and the reveal DOM (QA-verified). `<SwipeRow>` replaces the four copy-pasted `useLongPress` hooks and unifies pointer + keyboard "open menu" handling. Each list is rewired to wrap its row content in `<SwipeRow>`, keeping the existing long-press menu as a sibling.

**Tech Stack:** React 19, TypeScript, Tailwind 4, lucide-react, Vitest. Pointer Events API.

**Spec:** `docs/superpowers/specs/2026-07-22-pulse-swipe-delete-design.md`

## Global Constraints

- No new dependency; locked stack only.
- No sync / entity / op-schema / migration / cron / agent change. Dexie stays at v9.
- Purely additive: every existing delete affordance (long-press menu, money's visible Delete button) and every keyboard/screen-reader path is preserved.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
- Gate is run UN-CHAINED: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` as four separate commands; every one must be green (lint: 0 errors) before commit.
- `prefers-reduced-motion` respected (`motion-reduce:transition-none`); revealed Delete button ≥ 44px tap target (width 88px, full row height).
- Constants: `REVEAL_WIDTH = 88`, `SLOP = 8`, `OPEN_RATIO = 0.5`, long-press `500ms`.

## File Structure

- Create: `src/lib/gesture-swipe.ts` — pure reducer + constants + types.
- Create: `tests/lib/gesture-swipe.test.ts` — reducer unit tests.
- Create: `src/components/swipe-row.tsx` — pointer/keyboard/reveal wrapper.
- Create: `docs/superpowers/notes/2026-07-22-pulse-swipe-delete-qa-runbook.md`.
- Modify: `src/components/money-list.tsx`, `src/components/task-list.tsx`, `src/components/learning-list.tsx`, `src/components/notes-list.tsx` (drop local `useLongPress`, wrap rows in `<SwipeRow>`).

---

### Task 1: Pure `swipeReducer`

**Files:**
- Create: `src/lib/gesture-swipe.ts`
- Test: `tests/lib/gesture-swipe.test.ts`

**Interfaces:**
- Produces:
  - `REVEAL_WIDTH: number` (88), `SLOP: number` (8), `OPEN_RATIO: number` (0.5)
  - `type SwipeState = { startX: number; startY: number; baseX: number; axis: 'x' | 'y' | null; translateX: number; open: boolean }`
  - `type SwipeAction = { type: 'down'; x: number; y: number } | { type: 'move'; x: number; y: number } | { type: 'up' } | { type: 'reset' }`
  - `const initialSwipeState: SwipeState`
  - `function swipeReducer(state: SwipeState, action: SwipeAction, cfg?: { revealWidth: number }): SwipeState`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gesture-swipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { swipeReducer, initialSwipeState, REVEAL_WIDTH, type SwipeState, type SwipeAction } from '@/lib/gesture-swipe'

function run(actions: SwipeAction[], start: Partial<SwipeState> = {}): SwipeState {
  return actions.reduce((s, a) => swipeReducer(s, a), { ...initialSwipeState, ...start })
}

describe('swipeReducer', () => {
  it('keeps a sub-slop move a tap (no axis, no translate)', () => {
    const s = run([{ type: 'down', x: 100, y: 100 }, { type: 'move', x: 104, y: 103 }])
    expect(s.axis).toBeNull()
    expect(s.translateX).toBe(0)
  })

  it('locks horizontal on a leftward drag and tracks translateX', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 170, y: 104 }])
    expect(s.axis).toBe('x')
    expect(s.translateX).toBe(-30)
  })

  it('locks vertical and does not hijack scroll', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 204, y: 140 }])
    expect(s.axis).toBe('y')
    expect(s.translateX).toBe(0)
  })

  it('clamps the reveal to the button width (no overshoot)', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 20, y: 100 }])
    expect(s.translateX).toBe(-REVEAL_WIDTH)
  })

  it('does not slide right of rest when closed', () => {
    const s = run([{ type: 'down', x: 100, y: 100 }, { type: 'move', x: 150, y: 100 }])
    expect(s.axis).toBe('x')
    expect(s.translateX).toBe(0)
  })

  it('settles open when released past the ratio', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 140, y: 100 }, { type: 'up' }])
    expect(s.open).toBe(true)
    expect(s.translateX).toBe(-REVEAL_WIDTH)
  })

  it('settles closed when released before the ratio', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 180, y: 100 }, { type: 'up' }])
    expect(s.open).toBe(false)
    expect(s.translateX).toBe(0)
  })

  it('resumes from the open base on a second gesture', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    expect(opened.open).toBe(true)
    const down = swipeReducer(opened, { type: 'down', x: 50, y: 100 })
    expect(down.baseX).toBe(-REVEAL_WIDTH)
    const moved = swipeReducer(down, { type: 'move', x: 70, y: 100 }) // dx=+20 from open base
    expect(moved.axis).toBe('x')
    expect(moved.translateX).toBe(-REVEAL_WIDTH + 20)
  })

  it('closes on a tap (no axis lock) while open', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    const tapped = swipeReducer(swipeReducer(opened, { type: 'down', x: 50, y: 50 }), { type: 'up' })
    expect(tapped.open).toBe(false)
    expect(tapped.translateX).toBe(0)
  })

  it('reset returns to the closed initial state', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    const reset = swipeReducer(opened, { type: 'reset' })
    expect(reset.open).toBe(false)
    expect(reset.translateX).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/gesture-swipe.test.ts`
Expected: FAIL — cannot resolve `@/lib/gesture-swipe`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/gesture-swipe.ts`:

```ts
export const REVEAL_WIDTH = 88
export const SLOP = 8
export const OPEN_RATIO = 0.5

export type SwipeState = {
  startX: number
  startY: number
  baseX: number
  axis: 'x' | 'y' | null
  translateX: number
  open: boolean
}

export type SwipeAction =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'reset' }

export type SwipeConfig = { revealWidth: number }

export const initialSwipeState: SwipeState = {
  startX: 0, startY: 0, baseX: 0, axis: null, translateX: 0, open: false,
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function swipeReducer(
  state: SwipeState,
  action: SwipeAction,
  cfg: SwipeConfig = { revealWidth: REVEAL_WIDTH },
): SwipeState {
  const { revealWidth } = cfg
  switch (action.type) {
    case 'down': {
      const baseX = state.open ? -revealWidth : 0
      return { ...state, startX: action.x, startY: action.y, axis: null, baseX, translateX: baseX }
    }
    case 'move': {
      const dx = action.x - state.startX
      const dy = action.y - state.startY
      let axis = state.axis
      if (axis === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return state
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (axis === 'y') return { ...state, axis, translateX: state.baseX }
      return { ...state, axis, translateX: clamp(state.baseX + dx, -revealWidth, 0) }
    }
    case 'up': {
      if (state.axis === 'x') {
        const open = state.translateX <= -revealWidth * OPEN_RATIO
        return { ...state, axis: null, open, translateX: open ? -revealWidth : 0 }
      }
      if (state.open) return { ...state, axis: null, open: false, translateX: 0 }
      return { ...state, axis: null }
    }
    case 'reset':
      return initialSwipeState
    default:
      return state
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/gesture-swipe.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gesture-swipe.ts tests/lib/gesture-swipe.test.ts
git commit -m "feat(swipe): pure swipeReducer for swipe-to-reveal gesture"
```

---

### Task 2: `<SwipeRow>` wrapper component

**Files:**
- Create: `src/components/swipe-row.tsx`

**Interfaces:**
- Consumes: `swipeReducer`, `initialSwipeState`, `REVEAL_WIDTH` from `@/lib/gesture-swipe`; `cn` from `@/lib/utils`; `Trash2` from `lucide-react`.
- Produces:
  ```ts
  type SwipeRowProps = {
    onDelete: () => void
    onLongPress?: () => void          // opens the list's existing long-press menu (pointer hold OR keyboard Enter/Space)
    deleteLabel: string               // aria-label for the revealed Delete button
    isOpen: boolean                   // controlled by parent (one row open at a time)
    onOpenChange: (open: boolean) => void
    className?: string                // the row's existing glass-soft/layout classes, applied to the moving content layer
    children: React.ReactNode
  }
  export function SwipeRow(props: SwipeRowProps): JSX.Element
  ```

**Notes for the implementer:** This component is verified via the on-device QA runbook (Task 4), not unit tests — jsdom performs no layout or hit-testing, so a real pointer drag cannot be simulated meaningfully. Type-correctness is enforced by `pnpm typecheck` and the fact that all four lists compile against it.

- [ ] **Step 1: Write the component**

Create `src/components/swipe-row.tsx`:

```tsx
'use client'

import { useEffect, useReducer, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { swipeReducer, initialSwipeState, REVEAL_WIDTH } from '@/lib/gesture-swipe'

const LONG_PRESS_MS = 500

type SwipeRowProps = {
  onDelete: () => void
  onLongPress?: () => void
  deleteLabel: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: React.ReactNode
}

export function SwipeRow({ onDelete, onLongPress, deleteLabel, isOpen, onOpenChange, className, children }: SwipeRowProps) {
  const [state, dispatch] = useReducer(swipeReducer, initialSwipeState)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downRef = useRef(false)
  const consumedRef = useRef(false)

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  // Parent closed this row (another row opened) → reset without reporting back.
  useEffect(() => {
    if (!isOpen && state.open) dispatch({ type: 'reset' })
  }, [isOpen, state.open])

  // Clean up a pending long-press timer on unmount.
  useEffect(() => () => clearTimer(), [])

  function handleDown(e: React.PointerEvent) {
    downRef.current = true
    consumedRef.current = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture unsupported */ }
    dispatch({ type: 'down', x: e.clientX, y: e.clientY })
    if (onLongPress) {
      clearTimer()
      timerRef.current = setTimeout(() => { clearTimer(); onLongPress() }, LONG_PRESS_MS)
    }
  }

  function handleMove(e: React.PointerEvent) {
    if (!downRef.current) return
    const next = swipeReducer(state, { type: 'move', x: e.clientX, y: e.clientY })
    if (next.axis !== null) clearTimer()  // any directional lock cancels long-press
    dispatch({ type: 'move', x: e.clientX, y: e.clientY })
  }

  function handleUp() {
    if (!downRef.current) return
    downRef.current = false
    clearTimer()
    const next = swipeReducer(state, { type: 'up' })
    // Suppress the trailing click when the gesture swiped or closed-on-tap,
    // so a settle/close never also fires an inner button (complete, receipt…).
    consumedRef.current = state.axis === 'x' || (state.open && !next.open)
    dispatch({ type: 'up' })
    if (next.open !== state.open) onOpenChange(next.open)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return       // ignore keys bubbling from inner controls
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') e.preventDefault()
      onLongPress?.()
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl focus-within:ring-2 focus-within:ring-accent-2">
      {state.translateX < 0 && (
        <button
          type="button"
          aria-label={deleteLabel}
          tabIndex={isOpen ? 0 : -1}
          onClick={onDelete}
          style={{ width: REVEAL_WIDTH }}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-white focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
      )}
      <div
        tabIndex={onLongPress ? 0 : undefined}
        onKeyDown={onLongPress ? handleKeyDown : undefined}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onClickCapture={e => { if (consumedRef.current) { e.stopPropagation(); e.preventDefault(); consumedRef.current = false } }}
        style={{ transform: `translateX(${state.translateX}px)` }}
        className={cn(
          className,
          // The focus ring lives on the container (focus-within) so overflow-hidden
          // does not clip this layer's box-shadow ring.
          'relative touch-pan-y outline-none',
          state.axis === 'x' ? '' : 'transition-transform duration-200 motion-reduce:transition-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/swipe-row.tsx
git commit -m "feat(swipe): SwipeRow wrapper (pointer + long-press + keyboard + reveal)"
```

---

### Task 3: Wire money-list + task-list

**Files:**
- Modify: `src/components/money-list.tsx`
- Modify: `src/components/task-list.tsx`

**Interfaces:**
- Consumes: `SwipeRow` from `@/components/swipe-row`.

**Pattern for both files:** remove the local `useLongPress` definition and its usage; drop the now-unused `useRef` from the `react` import; add `const [openId, setOpenId] = useState<string | null>(null)`; wrap each row's content in `<SwipeRow>` and move the existing long-press menu to a sibling under a `relative` container. Do NOT change any `deleteX` / `toggleComplete` / sync logic.

- [ ] **Step 1: money-list — imports + state**

In `src/components/money-list.tsx`:

Change line 3 from:
```ts
import { useMemo, useRef, useState } from 'react'
```
to:
```ts
import { useMemo, useState } from 'react'
```

Add the import (after the `Button` import, line 6):
```ts
import { SwipeRow } from '@/components/swipe-row'
```

Delete the entire `useLongPress` helper (lines 18–27):
```ts
function useLongPress<T>(onLongPress: (arg: T) => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  return {
    onPointerDown: (arg: T) => {
      timerRef.current = setTimeout(() => onLongPress(arg), ms)
    },
    onPointerUp: () => { if (timerRef.current) clearTimeout(timerRef.current) },
    onPointerLeave: () => { if (timerRef.current) clearTimeout(timerRef.current) },
  }
}
```

Delete the `longPress` line inside the component (line 41):
```ts
  const longPress = useLongPress<MoneyEntryRow>(e => setMenuFor(e.id))
```

Add next to the other `useState`s (after the `menuFor` line):
```ts
  const [openId, setOpenId] = useState<string | null>(null)
```

- [ ] **Step 2: money-list — rewrap the row**

Replace the entire `<li>` block (from `<li` at line 80 to its closing `</li>` at line 176) with:

```tsx
            <li key={e.id} className="relative">
              <SwipeRow
                isOpen={openId === e.id}
                onOpenChange={o => setOpenId(o ? e.id : null)}
                onLongPress={() => setMenuFor(e.id)}
                onDelete={() => deleteEntry(e)}
                deleteLabel={`Delete entry: ${e.description || formatAmount(e)}`}
                className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3 text-sm transition-colors hover:bg-white/8"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  {cat && (
                    <div className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs">
                      <span>{cat.icon ?? ''}</span>
                      <span className="text-muted-foreground">{cat.name}</span>
                    </div>
                  )}
                  <div className="text-sm font-medium text-foreground">
                    {e.description ? e.description : (cat ? cat.name : 'Uncategorized')}
                  </div>
                  {e.description && cat && (
                    <span className="text-xs text-muted-foreground">{cat.name}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {e.currency !== prefs.primary_currency && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-accent-2 transition text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                        onClick={(ev) => { ev.stopPropagation(); setExpandedFx(expandedFx === e.id ? null : e.id) }}
                      >
                        {expandedFx === e.id ? (() => {
                          const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                          return conv
                            ? `≈ ${currencySymbol(prefs.primary_currency)}${(conv.amount / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(2)} at ${conv.rateDate}`
                            : 'No FX rate yet for this date'
                        })() : '≈ convert'}
                      </button>
                    )}
                    {e.receipt_key && (
                      <button
                        type="button"
                        className="text-[10px] border border-white/20 rounded-full px-1.5 py-0.5 text-muted-foreground hover:text-accent-2 hover:border-accent-2 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          window.open(`/api/receipt/${e.receipt_key}`, '_blank', 'noopener')
                        }}
                      >
                        📎 receipt
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={`font-mono tabular-nums text-sm font-medium whitespace-nowrap ${
                    e.direction === 'out' ? 'text-destructive' : 'text-income'
                  }`}>
                    {formatAmount(e)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] px-2 text-xs"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    onClick={() => deleteEntry(e)}
                  >
                    Delete
                  </Button>
                </div>
              </SwipeRow>

              {menuFor === e.id && (
                <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
                  <button
                    type="button"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => { deleteEntry(e); setMenuFor(null) }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                  {e.recurring_rule_id && (
                    <button
                      type="button"
                      className="px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      onClick={() => { router.push('/settings/recurring'); setMenuFor(null) }}
                    >
                      Edit recurring rule
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => setMenuFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
```

- [ ] **Step 3: task-list — imports + state**

In `src/components/task-list.tsx`:

Change line 3 from:
```ts
import { useRef, useState, useMemo } from 'react'
```
to:
```ts
import { useState, useMemo } from 'react'
```

Add the import (after line 7, the `subtasks` import):
```ts
import { SwipeRow } from '@/components/swipe-row'
```

Delete the entire `useLongPress` helper (lines 16–23) and the `longPress` line (line 34):
```ts
  const longPress = useLongPress<TaskRow>(t => setMenuFor(t.id))
```

Add next to the other `useState` (after the `menuFor` line 32):
```ts
  const [openId, setOpenId] = useState<string | null>(null)
```

- [ ] **Step 4: task-list — rewrap `renderRow`**

Replace the `renderRow` return (the `<div ...>` … `</div>` currently at lines 100–183) with this structure — a `relative` wrapper holding `<SwipeRow>` (around the existing complete-toggle button) and the menu as a sibling:

```tsx
    return (
      <div className="relative">
        <SwipeRow
          isOpen={openId === t.id}
          onOpenChange={o => setOpenId(o ? t.id : null)}
          onLongPress={() => setMenuFor(t.id)}
          onDelete={() => deleteTask(t)}
          deleteLabel={`Delete task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
          className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3"
        >
          <button
            type="button"
            onClick={() => { if (!hasChildren) toggleComplete(t) }}
            className="flex flex-1 items-start gap-2 text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            aria-label={hasChildren ? `${t.title} (${progress!.done} of ${progress!.total} done)` : (isCompleted ? `Mark "${t.title}" open` : `Complete "${t.title}"`)}
            aria-disabled={hasChildren}
          >
            {isCompleted ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-2" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="flex flex-col">
              <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
                {t.title}
                {progress && <span className="ml-2 font-mono tabular-nums text-xs text-muted-foreground">{progress.done}/{progress.total}</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.recur_period && t.recur_interval && (
                  <span className="mr-2 inline-flex items-center gap-0.5 text-accent-2">
                    <Repeat className="h-3 w-3" /> {formatRecurrence(t.recur_period, t.recur_interval)}
                  </span>
                )}
                {t.project_id && projectById.get(t.project_id) && (
                  <span className="mr-2 inline-flex items-center gap-1">
                    {projectById.get(t.project_id)!.color && (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: projectById.get(t.project_id)!.color! }} />
                    )}
                    {projectById.get(t.project_id)!.name}
                  </span>
                )}
                {(t.tags ?? []).map(tg => (
                  <span key={tg} className="mr-1 text-accent-2">#{tg}</span>
                ))}
                {t.priority !== 'medium' && (
                  <span className={`mr-2 ${t.priority === 'high' ? 'text-destructive' : ''}`}>
                    {t.priority}
                  </span>
                )}
                {t.due_at && (
                  <span className={`font-mono tabular-nums ${isOverdue ? 'text-warning' : ''}`}>
                    due {formatLocalDateTime(t.due_at, prefs.tz)}
                    {isOverdue && ' · overdue'}
                  </span>
                )}
              </span>
            </div>
          </button>
        </SwipeRow>

        {menuFor === t.id && (
          <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
            <button
              type="button"
              aria-label={`Delete task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              onClick={() => deleteTask(t)}
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              type="button"
              className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              onClick={() => setMenuFor(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    )
```

(The surrounding `renderRow` signature, the `progress`/`hasChildren`/`isCompleted`/`isOverdue` derivations above the `return`, and the `SubtaskAdd` component are unchanged.)

- [ ] **Step 5: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: typecheck clean; lint 0 errors; tests all pass; build succeeds (SW built). If lint flags an unused `useRef`/`Trash2`, confirm the import edits above were applied (money-list and task-list both still use `Trash2` in the menu, so keep it).

- [ ] **Step 6: Commit**

```bash
git add src/components/money-list.tsx src/components/task-list.tsx
git commit -m "feat(swipe): wire SwipeRow into money + task lists"
```

---

### Task 4: Wire learning-list + notes-list + QA runbook

**Files:**
- Modify: `src/components/learning-list.tsx`
- Modify: `src/components/notes-list.tsx`
- Create: `docs/superpowers/notes/2026-07-22-pulse-swipe-delete-qa-runbook.md`

**Interfaces:**
- Consumes: `SwipeRow` from `@/components/swipe-row`.

- [ ] **Step 1: learning-list — imports + state**

In `src/components/learning-list.tsx`:

Change line 3 from:
```ts
import { useRef, useState } from 'react'
```
to:
```ts
import { useState } from 'react'
```

Add the import (after line 6, the `useLearnings` import):
```ts
import { SwipeRow } from '@/components/swipe-row'
```

Delete the `useLongPress` helper (lines 14–21) and the `longPress` line (line 27):
```ts
  const longPress = useLongPress<LearningRow>(e => setMenuFor(e.id))
```

Add after the `menuFor` state (line 25):
```ts
  const [openId, setOpenId] = useState<string | null>(null)
```

- [ ] **Step 2: learning-list — rewrap the row**

Replace the `<li>` block (lines 55–118) with:

```tsx
        <li key={e.id} className="relative">
          <SwipeRow
            isOpen={openId === e.id}
            onOpenChange={o => setOpenId(o ? e.id : null)}
            onLongPress={() => setMenuFor(e.id)}
            onDelete={() => deleteLearning(e)}
            deleteLabel={`Delete learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
            className="glass-soft rounded-2xl flex flex-col gap-2 p-3"
          >
            <p className="text-sm">{e.text}</p>
            {e.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {e.tags.map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      selectedTag === tag
                        ? 'bg-accent-2/30 text-accent-2 border border-accent-2/50'
                        : 'bg-white/10 text-muted-foreground border border-white/20',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
              <div className="flex items-center gap-2">
                {e.attribution && (
                  <span className="truncate">— {e.attribution}</span>
                )}
              </div>
              <span className="font-mono tabular-nums flex-shrink-0">
                {formatLocalDateTime(e.occurred_at, prefs.tz)}
              </span>
            </div>
          </SwipeRow>

          {menuFor === e.id && (
            <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
              <button
                type="button"
                aria-label={`Delete learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => deleteLearning(e)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                type="button"
                className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => setMenuFor(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </li>
```

- [ ] **Step 3: notes-list — imports + state**

In `src/components/notes-list.tsx`:

Change line 3 from:
```ts
import { useRef, useState } from 'react'
```
to:
```ts
import { useState } from 'react'
```

Add the import (after line 6, the `useNotes` import):
```ts
import { SwipeRow } from '@/components/swipe-row'
```

Delete the `useLongPress` helper (lines 15–22) and the `longPress` line (line 33):
```ts
  const longPress = useLongPress<NoteRow>(e => setMenuFor(e.id))
```

Add after the `menuFor` state (line 31):
```ts
  const [openId, setOpenId] = useState<string | null>(null)
```

- [ ] **Step 4: notes-list — rewrap the row**

Replace the `<li>` block (lines 61–123) with:

```tsx
      {filtered.map(e => (
        <li key={e.id} className="relative">
          <SwipeRow
            isOpen={openId === e.id}
            onOpenChange={o => setOpenId(o ? e.id : null)}
            onLongPress={() => setMenuFor(e.id)}
            onDelete={() => deleteNote(e)}
            deleteLabel={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
            className="glass-soft rounded-2xl flex flex-col gap-2 p-3"
          >
            <p className="text-sm font-medium">{e.title || truncatePreview(e.body)}</p>
            {e.title && (
              <p className="text-xs text-muted-foreground line-clamp-2">{truncatePreview(e.body, 150)}</p>
            )}
            {e.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {e.tags.map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      selectedTag === tag
                        ? 'bg-accent-2/30 text-accent-2 border border-accent-2/50'
                        : 'bg-white/10 text-muted-foreground border border-white/20',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {formatLocalDateTime(e.occurred_at, prefs.tz)}
              </span>
            </div>
          </SwipeRow>

          {menuFor === e.id && (
            <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
              <button
                type="button"
                aria-label={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => deleteNote(e)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                type="button"
                className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                onClick={() => setMenuFor(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </li>
      ))}
```

- [ ] **Step 5: Create the QA runbook**

Create `docs/superpowers/notes/2026-07-22-pulse-swipe-delete-qa-runbook.md`:

```markdown
# Swipe-to-delete — QA Runbook (on-device)

Verify on the iPhone PWA (and once in a desktop browser with a mouse-drag).

**Per list — Money, Tasks (parent + sub-task), Learn, Notes:**
1. Swipe a row left → a red Delete button reveals and the row snaps open at ~88px.
2. Tap the revealed Delete → the row is deleted (Money also shows its Undo toast).
3. Swipe left a little then release before halfway → the row snaps back closed (no delete).
4. With one row open, swipe/open another → the first snaps closed (one open at a time).
5. Tap the body of an open row → it closes and does NOT trigger the row's action (Task: does not toggle complete; Money: does not open receipt/FX).
6. Scroll the list vertically over rows → the page scrolls normally; no row reveals Delete (vertical never hijacked).

**Regressions to confirm still work:**
7. Long-press a row (hold ~0.5s, no move) → the existing menu still opens (Delete / Cancel; Money also "Edit recurring rule").
8. Keyboard: Tab to a row, press Enter → the menu opens; Tab to its Delete, Enter → deletes.
9. Money's always-visible "Delete" button still deletes with Undo.
10. Task: completing a leaf task, sub-task add, and parent auto-complete all still work; swiping a parent deletes it and cascades its sub-tasks.
11. Reduced motion (iOS: Settings → Accessibility → Motion → Reduce Motion): the row jumps open/closed with no slide animation.
```

- [ ] **Step 6: Gate (UN-CHAINED)**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: all green (lint 0 errors — confirm no leftover unused `useRef` imports in learning-list/notes-list).

- [ ] **Step 7: Commit**

```bash
git add src/components/learning-list.tsx src/components/notes-list.tsx docs/superpowers/notes/2026-07-22-pulse-swipe-delete-qa-runbook.md
git commit -m "feat(swipe): wire SwipeRow into learning + notes lists + QA runbook"
```

---

## Post-implementation

- Opus whole-branch review (lenses: gesture correctness; regression to the existing menu / tap / vertical-scroll / money-undo; a11y — keyboard menu path + reduced motion + tap-target size).
- Merge to `main` (auto-deploys); no D1 migration. Verify CI `success` + prod HTTP 200.
- Owner follow-up: run the QA runbook on-device (esp. steps 5, 6, 8, 11).
