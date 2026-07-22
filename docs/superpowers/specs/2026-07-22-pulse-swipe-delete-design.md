# Swipe-to-reveal Delete — Design

**Date:** 2026-07-22
**Status:** Approved (design)
**Feature:** Native swipe-left-to-reveal-Delete gesture across the four entity lists (money / task / learning / notes).

## Goal

Add a mobile-native swipe-left gesture that reveals a Delete button on any row in the four lists, tapped to confirm. Purely additive polish: the existing long-press menu, money's visible Delete button, and every keyboard/screen-reader path are all preserved unchanged.

## Non-goals

- No full-swipe-commits-immediately behavior and therefore **no undo/resurrect work** — the reveal model needs a confirming tap, so a deleted row is never a surprise. (money keeps its existing undo because its `onDelete` reuses the same `deleteEntry`; the other three delete on tap exactly as their menu-Delete does today.)
- No keyboard-delete work: Notes already has the `tabIndex=0` + `onKeyDown`→menu pattern identical to learning/task (verified in `src/components/notes-list.tsx`). The memory note that Notes lacked it is stale.
- No change to sync, entities, op-schemas, migrations, agents, crons, or dependencies.
- The read-only query-answer lists (`query-list-answer.tsx`) are out of scope — they do not delete.

## Architecture

Two new units plus wiring into the four existing list components:

1. `src/lib/gesture-swipe.ts` — a **pure reducer** holding all gesture math. Unit-tested.
2. `src/components/swipe-row.tsx` — a wrapper component owning the pointer stream (drag + long-press) and the reveal DOM. QA-runbook-verified on device.
3. Wiring into `money-list.tsx`, `task-list.tsx`, `learning-list.tsx`, `notes-list.tsx`.

The wrapper **replaces the four copy-pasted `useLongPress` hooks** (currently duplicated verbatim in each list) — a DRY consolidation squarely in scope, since the long-press timer and the swipe both begin on the same `pointerdown` and must be arbitrated by a single owner.

### Unit 1 — `gesture-swipe.ts` (pure)

```
State  = { startX: number, startY: number, baseX: number,
           axis: 'x' | 'y' | null, translateX: number, open: boolean }
Action = { type: 'down', x, y } | { type: 'move', x, y } | { type: 'up' }

REVEAL_WIDTH = 88   // px — Delete button width (>= 44px tap target + padding)
SLOP         = 8    // px — movement before an axis locks
OPEN_RATIO   = 0.5  // release past 50% of the reveal → settle open
```

`swipeReducer(state, action, cfg = { revealWidth: REVEAL_WIDTH }) → State`

- **down(x,y):** `startX=x; startY=y; axis=null; baseX = state.open ? -revealWidth : 0; translateX = baseX`. `open` unchanged.
- **move(x,y):** let `dx=x-startX`, `dy=y-startY`.
  - If `axis===null`: while `max(|dx|,|dy|) < SLOP` return state unchanged (a tap is still possible). Once past SLOP, lock `axis = |dx| > |dy| ? 'x' : 'y'`.
  - If `axis==='y'`: return state unchanged (vertical scroll is never hijacked; `translateX` stays `baseX`).
  - If `axis==='x'`: `translateX = clamp(baseX + dx, -revealWidth, 0)` (reveal only leftward; never overshoots the button width, never slides right of rest).
- **up():**
  - If `axis==='x'`: `open = translateX <= -revealWidth * OPEN_RATIO`; `translateX = open ? -revealWidth : 0`; `axis=null`.
  - Else if `state.open` (a tap/no-lock while already open): close → `open=false; translateX=0`.
  - Else: no-op (a tap while closed; `open` stays false, `translateX` stays 0) so the tap falls through to the row's own action.

Pure and total — never throws, no I/O, no time/DOM. `clamp(v,lo,hi)=Math.min(hi,Math.max(lo,v))`.

The component derives "did this gesture consume the tap?" as `axis==='x'` OR (was-open-before-up AND now-closed); when consumed it suppresses the trailing click so a swipe/close never also triggers the row action.

### Unit 2 — `swipe-row.tsx`

```tsx
type SwipeRowProps = {
  onDelete: () => void
  onLongPress?: () => void
  deleteLabel: string                 // aria-label for the revealed Delete button
  isOpen: boolean                     // controlled by the parent list (one-open-at-a-time)
  onOpenChange: (open: boolean) => void
  className?: string                  // applied to the moving content layer (row's glass styling)
  children: React.ReactNode
}
```

Structure:

```
<div class="relative overflow-hidden rounded-2xl">       // clip layer (clips overhang, NOT the menu)
  <button class="absolute inset-y-0 right-0 w-[88px] flex items-center justify-center
                 bg-destructive text-white ..."          // revealed Delete, behind content
          aria-label={deleteLabel}
          tabIndex={isOpen ? 0 : -1} aria-hidden={!isOpen}
          onClick={onDelete}>
    <Trash2 />
  </button>
  <div style={{ transform: `translateX(${translateX}px)`,
                transition: dragging ? 'none' : undefined }}
       class="... motion-reduce:transition-none"          // animated snap, reduced-motion safe
       onPointerDown/Move/Up/Cancel={...} className={className}>
    {children}
  </div>
</div>
```

Behavior:
- Holds its own `swipeReducer` state via `useReducer`. Dispatches `down/move/up` from the pointer handlers; uses pointer capture so a drag that leaves the element still tracks.
- On `pointerdown` starts a 500ms long-press timer; **cancels it** on any axis lock (move) or on `pointerup`. Fires `onLongPress` only if the timer elapses with no lock.
- When the reducer settles `open`, calls `onOpenChange(open)`. When the parent flips `isOpen` to false (because another row opened), an effect resets the reducer to closed (`translateX→0`).
- `pointerup` when the gesture "consumed the tap" (see above) sets a one-shot flag and the moving layer's `onClickCapture` calls `stopPropagation()`/`preventDefault()` once, so the close/swipe does not also fire an inner button.
- The Delete button is a pointer-only affordance: focusable only when open; keyboard/SR users delete via the existing long-press menu.

### Wiring (each of the four lists)

Remove the local `useLongPress`. Add `const [openId, setOpenId] = useState<string | null>(null)`. Restructure each row:

```tsx
<li className="relative">
  <SwipeRow
    isOpen={openId === id}
    onOpenChange={o => setOpenId(o ? id : null)}
    onLongPress={() => setMenuFor(id)}
    onDelete={() => deleteX(entry)}
    deleteLabel={`Delete …: ${label}`}
    className={/* the row's existing glass-soft classes */}
  >
    {rowContent /* the existing inner content, minus the pointer handlers */}
  </SwipeRow>
  {menuFor === id && <ExistingMenu/>}   {/* sibling of SwipeRow, anchored to the relative <li> */}
</li>
```

Notes per list:
- **money-list:** `onDelete` reuses `deleteEntry`, so swipe-delete inherits money's undo toast. The visible Delete button and long-press menu are kept as-is (additive). The undo toast (fixed, bottom) is unaffected.
- **task-list:** `renderRow` returns the row; wrap its inner content. Because a parent row with children is a non-toggleable checkbox, swipe-delete on a parent cascades via the existing `deleteTask` (unchanged). Sub-task rows are wrapped the same way.
- **learning-list / notes-list:** straightforward wrap of the existing `<li>` content; `deleteLearning` / `deleteNote` reused.

The long-press menu **must** be a sibling of `SwipeRow` under the `relative` `<li>` (not inside the clip layer) so `overflow-hidden` clips the swipe overhang but never the `top-full` pop-out menu.

## Data flow

Pointer events → `SwipeRow` reducer → `translateX` (visual) + settled `open` → `onOpenChange` → parent `openId`. Tapping the revealed button → `onDelete` → the list's existing `deleteX` → `generateOp(delete)` → `applyLocalOp` → `pushPullOnce`. No new data path; delete is byte-identical to today's menu-Delete.

## Error handling

- The reducer is pure and total; it cannot throw.
- Delete reuses each list's existing handler, which already `.catch`es sync failures (`console.error`).
- Pointer Events unsupported (very old browsers): the handlers simply never fire; the long-press menu and keyboard paths remain fully functional (graceful degradation).
- `prefers-reduced-motion`: the snap transition is disabled (`motion-reduce:transition-none`) — the row jumps to open/closed instead of animating.

## Testing

**Unit (`tests/lib/gesture-swipe.test.ts`)** — the reducer:
1. move within SLOP → unchanged (tap preserved).
2. horizontal lock: leftward move past SLOP with `|dx|>|dy|` → `axis='x'`, negative `translateX`.
3. vertical lock: downward move with `|dy|>|dx|` → `axis='y'`, `translateX` stays `baseX` (scroll not hijacked).
4. clamp low: large leftward drag → `translateX === -REVEAL_WIDTH` (no overshoot).
5. clamp high: rightward drag from closed → `translateX === 0` (no right-of-rest).
6. settle open: release with `translateX <= -44` → `open=true`, snaps to `-88`.
7. settle closed: release with `translateX > -44` → `open=false`, snaps to `0`.
8. resume-from-open base: `down` while `open` → `baseX=-88`; a small rightward drag reduces reveal from the open base.
9. tap while open (`up` with no axis lock, `open=true`) → closes (`open=false`, `translateX=0`).

**DOM / integration:** `SwipeRow` and the four wirings are verified via an on-device QA runbook (`docs/superpowers/notes/2026-07-22-pulse-swipe-delete-qa-runbook.md`) — jsdom performs no layout or hit-testing, matching how the existing long-press and voice-recorder pointer gestures are validated in this project.

## Plan shape

~4 tasks: (1) reducer + tests; (2) `<SwipeRow>`; (3) wire money + task; (4) wire learning + notes + QA runbook. Opus whole-branch review at the end (lenses: gesture correctness / regression to existing menu + tap + scroll / a11y).

## Constraints (verbatim)

- Locked stack; **no new dependency**.
- No sync / entity / op-schema / migration / cron / agent change.
- Git identity `Sheik Ahamed <sdsheikahamed@gmail.com>`.
- Gate UN-CHAINED (`pnpm typecheck` / `lint` / `test` / `build` as separate commands).
- Preserve every existing delete affordance and a11y path (additive only).
- `motion-reduce:` respected; revealed button ≥ 44px tap target.
