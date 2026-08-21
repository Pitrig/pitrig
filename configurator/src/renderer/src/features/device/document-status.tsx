import { Badge } from '@/components/ui/badge'
import { CONFIGURATION_DOCUMENT_LABELS } from '@shared/configuration-documents'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'

/**
 * Which configuration document a page edits, and where that document stands.
 *
 * The three are saved and stored separately, so a page that edits one has an
 * answer of its own to "is this saved" — the workspace-wide badge could only
 * ever describe the draft as a whole. This is that answer, in the header of the
 * page that owns the document.
 */
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
