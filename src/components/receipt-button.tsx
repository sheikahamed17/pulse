'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import type { ReceiptStreamEvent } from '@/lib/receipt-sse'
import { callReceiptApiStreaming } from '@/lib/receipt-sse'
import { enqueueReceipt } from '@/lib/receipt-queue'
import { cn } from '@/lib/utils'

type Props = {
  disabled: boolean
  onParsed: (payload: unknown, previewUrl: string) => void
}

export function ReceiptButton({ disabled, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(file: File) {
    setState('uploading')
    setErrorMsg('')
    const previewUrl = URL.createObjectURL(file)

    try {
      const result = await callReceiptApiStreaming(file, (event: ReceiptStreamEvent) => {
        if (event.step === 'uploading') setState('uploading')
        else if (event.step === 'parsing') setState('parsing')
      })

      if (result) {
        onParsed(result.payload, previewUrl)
        setState('idle')
      } else {
        setErrorMsg('No payload received from server')
        setState('error')
      }
    } catch (err) {
      setErrorMsg((err as Error).message)
      setState('error')
      // Enqueue the receipt for later retry
      await enqueueReceipt(file)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        type="button"
        disabled={disabled || state !== 'idle'}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 disabled:pointer-events-none',
          'glass',
        )}
        aria-label="Upload receipt"
      >
        <Camera className="h-4 w-4" />
      </button>
      {state !== 'idle' && (
        <p className="text-xs text-muted-foreground">
          {state === 'uploading' && 'Uploading…'}
          {state === 'parsing' && 'Parsing…'}
          {state === 'error' && 'Failed'}
        </p>
      )}
      {state === 'error' && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
    </div>
  )
}
