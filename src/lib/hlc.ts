export type Hlc = {
  physicalMs: number
  logical: number
  deviceId: string
}

export function createHlc(deviceId: string, physicalMs: number): Hlc {
  return { physicalMs, logical: 0, deviceId }
}

// Lexicographically sortable: <16-digit physicalMs>-<6-digit logical>-<deviceId>
const PHYSICAL_PAD = 16
const LOGICAL_PAD = 6

export function serializeHlc(h: Hlc): string {
  const p = h.physicalMs.toString().padStart(PHYSICAL_PAD, '0')
  const l = h.logical.toString().padStart(LOGICAL_PAD, '0')
  return `${p}-${l}-${h.deviceId}`
}

export function parseHlc(s: string): Hlc {
  const [p, l, ...rest] = s.split('-')
  if (!p || !l || rest.length === 0) {
    throw new Error(`Invalid HLC serialization: ${s}`)
  }
  return {
    physicalMs: Number.parseInt(p, 10),
    logical: Number.parseInt(l, 10),
    deviceId: rest.join('-'), // deviceId may contain hyphens (e.g. UUIDs)
  }
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.physicalMs !== b.physicalMs) return a.physicalMs - b.physicalMs
  if (a.logical !== b.logical) return a.logical - b.logical
  return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0
}

// Advance the local HLC using current wall-clock reading
export function tickHlc(local: Hlc, physicalMsNow: number): Hlc {
  if (physicalMsNow > local.physicalMs) {
    return { physicalMs: physicalMsNow, logical: 0, deviceId: local.deviceId }
  }
  return { physicalMs: local.physicalMs, logical: local.logical + 1, deviceId: local.deviceId }
}

// Incorporate a received HLC from a remote device (e.g. inside an op we just received)
export function receiveHlc(local: Hlc, remote: Hlc, physicalMsNow: number): Hlc {
  const maxPhysical = Math.max(local.physicalMs, remote.physicalMs, physicalMsNow)

  if (maxPhysical === local.physicalMs && maxPhysical === remote.physicalMs) {
    return { physicalMs: maxPhysical, logical: Math.max(local.logical, remote.logical) + 1, deviceId: local.deviceId }
  }
  if (maxPhysical === local.physicalMs) {
    return { physicalMs: maxPhysical, logical: local.logical + 1, deviceId: local.deviceId }
  }
  if (maxPhysical === remote.physicalMs) {
    return { physicalMs: maxPhysical, logical: remote.logical + 1, deviceId: local.deviceId }
  }
  return { physicalMs: maxPhysical, logical: 0, deviceId: local.deviceId }
}
