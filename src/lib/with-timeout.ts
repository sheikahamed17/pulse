/**
 * Race a promise against a timeout. Resolves to the promise's value if it settles
 * first, or `null` if `ms` elapses first OR the promise rejects.
 *
 * Why this exists: navigator.serviceWorker.ready resolves only when a service
 * worker becomes active+controlling and otherwise pends FOREVER without ever
 * rejecting — so a try/catch can't rescue it. Any await on it needs a bounded
 * fallback, or the UI hangs on a loading state indefinitely (the Notifications
 * "Loading…" bug on iOS PWAs).
 *
 * `schedule` is injected (defaults to setTimeout) to keep this testable with fake timers.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v as T | null).catch(() => null),
    new Promise<null>((resolve) => { schedule(() => resolve(null), ms) }),
  ])
}
