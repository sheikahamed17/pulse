'use client'

import { useRef, useState } from 'react'
import type { ReceiptStreamEvent } from '@/lib/receipt-sse'
import { callReceiptApiStreaming } from '@/lib/receipt-sse'
import { Button } from '@/components/ui/button'

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
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || state !== 'idle'}
        onClick={() => inputRef.current?.click()}
      >
        {state === 'idle' && '📷 Receipt'}
        {state === 'uploading' && 'Uploading…'}
        {state === 'parsing' && 'Parsing…'}
        {state === 'error' && 'Failed'}
      </Button>
      {state === 'error' && (
        <p className="text-xs text-rose-600">{errorMsg}</p>
      )}
    </div>
  )
}
