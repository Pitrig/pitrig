import { useEffect, useState } from 'react'

import type { AppInfo } from '@shared/ipc'

let pending: Promise<AppInfo> | undefined
let cached: AppInfo | undefined

export function useAppInfo(): AppInfo | undefined {
  const [info, setInfo] = useState<AppInfo | undefined>(cached)
  useEffect(() => {
    if (cached) return
    pending ??= window.pitrig.getAppInfo()
    let cancelled = false
    void pending.then((value) => {
      cached = value
      if (!cancelled) setInfo(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return info
}
