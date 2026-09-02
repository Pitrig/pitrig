import { Badge } from '@/components/ui/badge'
import { DocumentStatusChip } from '@/features/device/document-status'
import { useDraftState } from '@/features/device/draft-state'
import { useModulesStore } from './modules-store'

export function ModulesStatusChip(): React.JSX.Element | null {
  const preview = useModulesStore((state) => state.preview)
  const error = useModulesStore((state) => state.previewError)
  const { connected, liveApplyAllowed } = useDraftState()

  if (preview.length === 0) return <DocumentStatusChip document="modules" />
  if (error) {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline" title={error}>
        Board refused the preview
      </Badge>
    )
  }
  if (!connected || !liveApplyAllowed) {
    return (
      <Badge className="text-muted-foreground" variant="outline">
        Previewing here only
      </Badge>
    )
  }
  return (
    <Badge
      className="border-sky-500/40 bg-sky-500/15 text-sky-300"
      variant="outline"
      title="The board is lit by what is being played and nothing else. A layer bound to telemetry follows the game there rather than the sweep shown here."
    >
      Previewing on the board
    </Badge>
  )
}
