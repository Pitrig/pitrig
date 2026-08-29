import { Badge } from '@/components/ui/badge'
import { CONFIGURATION_DOCUMENT_LABELS } from '@shared/configuration-documents'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'

export function DocumentStatusChip({
  document
}: {
  document: ConfigurationDocumentId
}): React.JSX.Element | null {
  const session = useDeviceStore((state) => state.session)
  const { connected, dirtyDocuments, unappliedDocuments } = useDraftState()
  if (!connected) return null
  const label = CONFIGURATION_DOCUMENT_LABELS[document]

  const stored = session?.info.documents[document]
  if (stored && stored.outcome !== 'valid' && stored.outcome !== 'absent') {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline">
        {label} config refused
      </Badge>
    )
  }
  if (unappliedDocuments.includes(document)) {
    return (
      <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300" variant="outline">
        {label} config not on the board
      </Badge>
    )
  }
  if (dirtyDocuments.includes(document)) {
    return (
      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
        {label} config shown, not saved
      </Badge>
    )
  }
  return (
    <Badge className="text-muted-foreground" variant="outline">
      {label} config in sync
    </Badge>
  )
}
