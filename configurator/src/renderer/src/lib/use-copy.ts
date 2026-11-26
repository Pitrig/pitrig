import { useEffect, useState } from 'react'

const COPIED_MS = 1500

export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return { copied, copy }
}
