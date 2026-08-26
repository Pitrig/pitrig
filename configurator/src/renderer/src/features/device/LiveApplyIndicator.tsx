import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'
import { useLiveApplyStore } from './live-apply-store'

export function LiveApplyIndicator(): React.JSX.Element | null {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const pending = useLiveApplyStore((state) => state.pending)
  const error = useLiveApplyStore((state) => state.error)
  const { missingFamilies } = useDraftState()
  if (!connected) return null

  if (error) {
    return (
      <span className="min-w-0 flex-1 truncate text-xs text-amber-300" title={error}>
        {`Live preview failed: ${error}`}
      </span>
    )
  }
  if (pending) {
    return (
      <span className="flex-none text-xs text-muted-foreground">Applying to the board…</span>
    )
  }
  if (missingFamilies.length > 0) {
    return (
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
        title={`The board does not hold ${missingFamilies.join(', ')} yet.`}
      >
        Preview only until you save — the board lacks a font.
      </span>
    )
  }
  return null
}
