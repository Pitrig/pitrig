import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'
import { useLiveApplyStore } from './live-apply-store'

/**
 * One line about what the board is showing right now.
 *
 * Three states are worth saying out loud: an apply in flight, an apply the
 * board refused, and a draft naming a font the board does not hold — the last
 * because the preview is then ahead of the board on purpose, and silence would
 * read as the board simply ignoring the edit.
 */
export function LiveApplyIndicator(): React.JSX.Element | null {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const pending = useLiveApplyStore((state) => state.pending)
  const error = useLiveApplyStore((state) => state.error)
  const { missingFamilies } = useDraftState()
  if (!connected) return null

  if (error) {
    return (
      // The one line here that has no bound of its own: a validation failure
      // carries whatever the firmware said. It takes the room left over and
      // ends in an ellipsis, with the whole of it in the tooltip.
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
