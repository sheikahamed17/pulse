import 'fake-indexeddb/auto'

// Polyfill localStorage for Node test environment
if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
  const storage: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]) },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    length: Object.keys(storage).length,
  } as Storage
}

// Vitest setup file — extend matchers or polyfill globals here as needed.
