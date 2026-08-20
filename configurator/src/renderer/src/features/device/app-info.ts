import { useEffect, useState } from 'react'

import type { AppInfo } from '@shared/ipc'

// The application's own name and version never change while it runs, so the
// request is made once for the process rather than once per page that asks.
let pending: Promise<AppInfo> | undefined
let cached: AppInfo | undefined

export function useAppInfo(): AppInfo | undefined {
  const [info, setInfo] = useState<AppInfo | undefined>(cached)
  useEffect(() => {
    if (cached) return
    pending ??= window.simcore.getAppInfo()
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
