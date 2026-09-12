import { useEffect, useRef } from 'react'

export interface FrameCommits {
  schedule: (commit: () => void) => void
  flush: () => void
  drop: () => void
}

export function useFrameCommits(): FrameCommits {
  const frame = useRef<number | undefined>(undefined)
  const pending = useRef<(() => void) | undefined>(undefined)

  const cancelFrame = (): void => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
  }

  const drop = (): void => {
    cancelFrame()
    pending.current = undefined
  }

  const take = (): (() => void) | undefined => {
    const commit = pending.current
    pending.current = undefined
    return commit
  }

  const flush = (): void => {
    cancelFrame()
    take()?.()
  }

  const schedule = (commit: () => void): void => {
    cancelFrame()
    pending.current = commit
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      take()?.()
    })
  }

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      pending.current = undefined
    },
    []
  )

  return { schedule, flush, drop }
}
