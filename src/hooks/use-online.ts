'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to track online status.
 * SSR-safe: defaults to true when navigator is undefined.
 * Subscribes to window online/offline events.
 * Returns current navigator.onLine value.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  useEffect(() => {
    const handleOnline = () => setOnline(navigator.onLine)
    const handleOffline = () => setOnline(navigator.onLine)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
