/**
 * Cross-tab drain guard via Web Locks API.
 * If navigator.locks is available, acquires a named lock with ifAvailable=true
 * (non-blocking; returns null if unavailable). If the lock is granted, runs fn.
 * Otherwise (no lock or no API), fn is skipped on this tab.
 *
 * This prevents concurrent drains when multiple tabs are open. The in-process
 * isDraining guard in voice-queue and receipt-queue is a fast path; Web Locks
 * handles the cross-tab case.
 *
 * Fallback (no navigator.locks, e.g., Node tests): runs fn anyway.
 */
export async function withWebLock(name: string, fn: () => Promise<void>): Promise<void> {
  if (!navigator?.locks?.request) {
    // Node environment or missing API; run directly.
    await fn()
    return
  }

  await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock) {
      await fn()
    }
    // If lock is null, ifAvailable prevented acquisition; skip fn.
  })
}
