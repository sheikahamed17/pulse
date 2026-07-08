const STORAGE_KEY = 'pulse.pin'
const ITERATIONS = 210_000
const RELOCK_MS = 5 * 60_000

export interface PinStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredPin { salt: string; hash: string; iterations: number }

function store(s?: PinStore): PinStore {
  return s ?? (globalThis.localStorage as unknown as PinStore)
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, 256)
  return toB64(bits)
}

// Constant-time-ish string compare to avoid leaking match length via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function setPin(pin: string, s?: PinStore): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  const rec: StoredPin = { salt: toB64(salt.buffer), hash, iterations: ITERATIONS }
  store(s).setItem(STORAGE_KEY, JSON.stringify(rec))
}

export function isPinSet(s?: PinStore): boolean {
  return store(s).getItem(STORAGE_KEY) !== null
}

export async function verifyPin(pin: string, s?: PinStore): Promise<boolean> {
  const raw = store(s).getItem(STORAGE_KEY)
  if (!raw) return false
  const rec = JSON.parse(raw) as StoredPin
  const hash = await derive(pin, fromB64(rec.salt), rec.iterations)
  return safeEqual(hash, rec.hash)
}

export function clearPin(s?: PinStore): void {
  store(s).removeItem(STORAGE_KEY)
}

// Pure lock-timeout policy. Locked if never unlocked, or idle past the timeout.
export function shouldRelock(lastActiveAt: number | null, now: number, timeoutMs = RELOCK_MS): boolean {
  if (lastActiveAt === null) return true
  return now - lastActiveAt > timeoutMs
}
