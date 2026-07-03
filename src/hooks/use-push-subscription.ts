'use client'

import { useEffect, useState, useCallback } from 'react'

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

      // Get registration and check existing subscription
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()

        if (sub) {
          setStatus('subscribed')
        } else if (permission === 'granted') {
          setStatus('unsubscribed')
        } else {
          setStatus('unsubscribed') // default
        }
      } catch {
        setStatus('unsubscribed')
      }
    }

    detect()
  }, [])

  const subscribe = useCallback(async () => {
    try {
      // Request notification permission (must be called from a user gesture)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      // Get service worker registration
      const reg = await navigator.serviceWorker.ready
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

      if (!res.ok) throw new Error(`subscribe ${res.status}`)

      setStatus('subscribed')
    } catch (err) {
      console.error('subscribe failed:', err)
      setStatus('unsubscribed')
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    try {
      // Get current subscription
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()

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

  return { status, subscribe, unsubscribe }
}
