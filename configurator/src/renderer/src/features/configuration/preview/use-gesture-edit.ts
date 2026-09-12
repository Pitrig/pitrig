import { useEffect, useRef } from 'react'

import { useDeviceStore } from '@/features/device/device-store'

export interface GestureEdit {
  startEdit: () => void
  finishEdit: () => void
}

function closeEdit(editing: { current: boolean }): void {
  if (!editing.current) return
  editing.current = false
  useDeviceStore.getState().endEdit()
}

export function useGestureEdit(abort: () => boolean): GestureEdit {
  const editing = useRef(false)
  const abortRef = useRef(abort)
  useEffect(() => {
    abortRef.current = abort
  })

  const startEdit = (): void => {
    if (editing.current) return
    editing.current = true
    useDeviceStore.getState().beginEdit()
  }

  const finishEdit = (): void => closeEdit(editing)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (!abortRef.current()) return
      closeEdit(editing)
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      closeEdit(editing)
    }
  }, [])

  return { startEdit, finishEdit }
}
