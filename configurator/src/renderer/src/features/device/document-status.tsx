import { Badge } from '@/components/ui/badge'
import { t } from '@shared/ui-text'
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
  const label = t(`documents.label.${document}`)

  const stored = session?.info.documents[document]
  if (stored && stored.outcome !== 'valid' && stored.outcome !== 'absent') {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline">
        {t('device.documentStatus.refused', { label })}
      </Badge>
    )
  }
  if (unappliedDocuments.includes(document)) {
    return (
      <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300" variant="outline">
        {t('device.documentStatus.notOnBoard', { label })}
      </Badge>
    )
  }
  if (dirtyDocuments.includes(document)) {
    return (
      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
        {t('device.documentStatus.shownNotSaved', { label })}
      </Badge>
    )
  }
  return (
    <Badge className="text-muted-foreground" variant="outline">
      {t('device.documentStatus.inSync', { label })}
    </Badge>
  )
}
