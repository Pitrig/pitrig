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
  const { connected, dirtyDocuments } = useDraftState()
  if (!connected) return null

  const stored = session?.info.documents[document]
  if (stored && stored.outcome !== 'valid' && stored.outcome !== 'absent') {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline">
        {CONFIGURATION_DOCUMENT_LABELS[document]} config refused
      </Badge>
    )
  }
  if (dirtyDocuments.includes(document)) {
    return (
      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
        {CONFIGURATION_DOCUMENT_LABELS[document]} config modified
      </Badge>
    )
  }
  return (
    <Badge className="text-muted-foreground" variant="outline">
      {CONFIGURATION_DOCUMENT_LABELS[document]} config in sync
    </Badge>
  )
}
