import { useEffect } from 'react'

import { useDeviceStore } from '@/features/device/device-store'
import { isTextEntry } from '@/features/configuration/editor/keyboard'
import { duplicateEffects, removeEffects } from './layer-commands'
import { useModulesStore } from './modules-store'

export function useModulesShortcuts(output: number, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target) || event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      const accelerator = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      const draft = useDeviceStore.getState()
      if (accelerator && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) draft.redo()
        else draft.undo()
        return
      }
      if (accelerator && key === 'y') {
        event.preventDefault()
        draft.redo()
        return
      }
      const modules = useModulesStore.getState()
      if (modules.picked.length === 0) return
      if (key === 'escape') {
        modules.selectEffect(-1)
        return
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        removeEffects(output, modules.picked)
        modules.clearPreview(output)
        modules.selectEffect(-1)
        return
      }
      if (accelerator && key === 'd') {
        event.preventDefault()
        const copies = duplicateEffects(output, modules.picked)
        if (copies.length > 0) modules.pickEffects(copies)
        modules.clearPreview(output)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, output])
}
