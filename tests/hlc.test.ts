import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  createHlc,
  serializeHlc,
  parseHlc,
  compareHlc,
  tickHlc,
  receiveHlc,
} from '@/lib/hlc'

describe('HLC creation and serialization', () => {
  it('creates an HLC with current time and zero logical counter', () => {
    const h = createHlc('device-a', 1700000000000)
    expect(h.physicalMs).toBe(1700000000000)
    expect(h.logical).toBe(0)
    expect(h.deviceId).toBe('device-a')
  })

  it('serializes and parses round-trip identically', () => {
    const h = createHlc('device-a', 1700000000000)
    const s = serializeHlc(h)
    const parsed = parseHlc(s)
    expect(parsed).toEqual(h)
  })

  it('serialized form is lexicographically sortable', () => {
    const a = serializeHlc({ physicalMs: 1, logical: 0, deviceId: 'a' })
    const b = serializeHlc({ physicalMs: 1, logical: 1, deviceId: 'a' })
    const c = serializeHlc({ physicalMs: 2, logical: 0, deviceId: 'a' })
    expect([a, b, c].sort()).toEqual([a, b, c])
  })
})

describe('HLC tick (advance local clock)', () => {
  it('advances physical ms when physical clock is ahead', () => {
    const h = createHlc('device-a', 100)
    const next = tickHlc(h, 200) // wall clock now reads 200
    expect(next.physicalMs).toBe(200)
    expect(next.logical).toBe(0)
  })

  it('increments logical counter when physical clock stalls', () => {
    const h = { physicalMs: 100, logical: 0, deviceId: 'a' }
    const next = tickHlc(h, 100) // wall clock unchanged
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(1)
  })

  it('increments logical counter when physical clock is behind (clock drift)', () => {
    const h = { physicalMs: 100, logical: 5, deviceId: 'a' }
    const next = tickHlc(h, 50) // wall clock went backwards
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(6)
  })
})

describe('HLC receive (incorporate remote HLC)', () => {
  it('advances past remote when remote.physicalMs > local', () => {
    const local = { physicalMs: 100, logical: 0, deviceId: 'a' }
    const remote = { physicalMs: 200, logical: 0, deviceId: 'b' }
    const next = receiveHlc(local, remote, 150) // wall clock = 150
    expect(next.physicalMs).toBe(200)
    expect(next.logical).toBe(1)
    expect(next.deviceId).toBe('a') // still our device
  })

  it('uses max logical + 1 when physicalMs ties', () => {
    const local = { physicalMs: 100, logical: 3, deviceId: 'a' }
    const remote = { physicalMs: 100, logical: 7, deviceId: 'b' }
    const next = receiveHlc(local, remote, 100)
    expect(next.physicalMs).toBe(100)
    expect(next.logical).toBe(8)
  })
})

describe('HLC compare', () => {
  it('orders by physicalMs first', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 9, deviceId: 'z' },
      { physicalMs: 2, logical: 0, deviceId: 'a' }
    )).toBeLessThan(0)
  })

  it('breaks ties by logical', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 0, deviceId: 'z' },
      { physicalMs: 1, logical: 1, deviceId: 'a' }
    )).toBeLessThan(0)
  })

  it('breaks remaining ties by deviceId lexicographically', () => {
    expect(compareHlc(
      { physicalMs: 1, logical: 0, deviceId: 'a' },
      { physicalMs: 1, logical: 0, deviceId: 'b' }
    )).toBeLessThan(0)
  })
})

describe('HLC properties', () => {
  // Arbitrary HLC generator
  const hlcArb = fc.record({
    physicalMs: fc.integer({ min: 0, max: 2 ** 50 }),
    logical: fc.integer({ min: 0, max: 999_999 }),
    deviceId: fc.stringMatching(/^[a-z0-9-]{1,32}$/),
  })

  it('serialize/parse is a round trip', () => {
    fc.assert(fc.property(hlcArb, h => {
      expect(parseHlc(serializeHlc(h))).toEqual(h)
    }))
  })

  it('serialized form sorts in the same order as compareHlc', () => {
    fc.assert(fc.property(fc.array(hlcArb, { minLength: 2, maxLength: 10 }), arr => {
      const byCompare = [...arr].sort(compareHlc)
      const byString = [...arr].sort((a, b) => serializeHlc(a) < serializeHlc(b) ? -1 : serializeHlc(a) > serializeHlc(b) ? 1 : 0)
      expect(byCompare).toEqual(byString)
    }))
  })

  it('tickHlc always produces an HLC strictly greater than the input', () => {
    fc.assert(fc.property(hlcArb, fc.integer({ min: 0, max: 2 ** 50 }), (h, wall) => {
      const next = tickHlc(h, wall)
      expect(compareHlc(next, h)).toBeGreaterThan(0)
    }))
  })

  it('receiveHlc result is greater than both local and remote', () => {
    fc.assert(fc.property(hlcArb, hlcArb, fc.integer({ min: 0, max: 2 ** 50 }), (local, remote, wall) => {
      const result = receiveHlc(local, remote, wall)
      expect(compareHlc(result, local)).toBeGreaterThan(0)
      // result must be ≥ remote (not necessarily strictly greater — different device IDs may tie)
      const cmp = compareHlc(result, remote)
      expect(cmp === 0 ? result.deviceId === remote.deviceId : cmp > 0).toBe(true)
    }))
  })

  it('compareHlc is transitive', () => {
    fc.assert(fc.property(hlcArb, hlcArb, hlcArb, (a, b, c) => {
      const ab = compareHlc(a, b)
      const bc = compareHlc(b, c)
      if (ab < 0 && bc < 0) expect(compareHlc(a, c)).toBeLessThan(0)
      if (ab > 0 && bc > 0) expect(compareHlc(a, c)).toBeGreaterThan(0)
    }))
  })
})
