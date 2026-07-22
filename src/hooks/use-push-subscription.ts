'use client'

import { useEffect, useState, useCallback } from 'react'
import { withTimeout } from '@/lib/with-timeout'

export type PushStatus = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'pending'

/**
 * Base64 URL decoder for VAPID public key
 */
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (base64.length % 4)) % 4
  const padded = base64 + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Hook for Web Push subscription management
 * Detects browser support, reads existing subscription, and manages subscribe/unsubscribe
 */
export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('pending')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function detect() {
      // Check for browser support
      const sw =
        typeof navigator !== 'undefined' && navigator.serviceWorker
      const pm = sw && typeof PushManager !== 'undefined'
      const notif = typeof Notification !== 'undefined'

      if (!sw || !pm || !notif) {
        setStatus('unsupported')
        return
      }

      // Check notification permission
      const permission = Notification.permission
      if (permission === 'denied') {
        setStatus('denied')
        return
      }

      // Get registration and check existing subscription.
      // serviceWorker.ready can pend forever on iOS standalone PWAs (never resolves,
      // never rejects), which would leave status on 'pending' → "Loading…" forever.
      // Bound it and fall back to getRegistration() (resolves promptly) so we always
      // reach a definite state.
      try {
        const reg =
          (await withTimeout(navigator.serviceWorker.ready, 3000)) ??
          (await navigator.serviceWorker.getRegistration()) ??
          null
        const sub = reg ? await reg.pushManager.getSubscription() : null
        setStatus(sub ? 'subscribed' : 'unsubscribed')
      } catch {
        setStatus('unsubscribed')
      }
    }

    detect()
  }, [])

  const subscribe = useCallback(async () => {
    setError(null)
    try {
      // Request notification permission (must be called from a user gesture)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        // 'denied' = blocked in settings; 'default' = prompt dismissed (retryable)
        setStatus(permission === 'denied' ? 'denied' : 'unsubscribed')
        if (permission !== 'denied') setError('Permission was not granted — tap Enable and choose Allow.')
        return
      }

      // Get service worker registration (bounded — see detect()).
      const reg =
        (await withTimeout(navigator.serviceWorker.ready, 5000)) ??
        (await navigator.serviceWorker.getRegistration())
      if (!reg) throw new Error('service worker not ready — try reopening the app')
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set')
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlToUint8Array(vapidKey) as BufferSource,
      })

      // Send subscription to server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh') as ArrayBuffer))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth') as ArrayBuffer))),
          },
        }),
      })

      if (!res.ok) throw new Error(`Server rejected the subscription (HTTP ${res.status})`)

      setStatus('subscribed')
    } catch (err) {
      console.error('subscribe failed:', err)
      setError((err as Error)?.message || String(err))
      setStatus('unsubscribed')
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    try {
      // Get current subscription (bounded — see detect()).
      const reg =
        (await withTimeout(navigator.serviceWorker.ready, 5000)) ??
        (await navigator.serviceWorker.getRegistration())
      const sub = reg ? await reg.pushManager.getSubscription() : null

      if (sub) {
        // Unsubscribe locally
        await sub.unsubscribe()

        // Notify server
        const res = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })

        if (!res.ok) console.warn(`unsubscribe ${res.status}`)
      }

      setStatus('unsubscribed')
    } catch (err) {
      console.error('unsubscribe failed:', err)
    }
  }, [])

  return { status, error, subscribe, unsubscribe }
}
