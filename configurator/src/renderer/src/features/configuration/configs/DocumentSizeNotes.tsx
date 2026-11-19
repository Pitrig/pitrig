import { useMemo } from 'react'
import { t } from '@shared/ui-text'

import { documentPayloadBytes } from '@shared/configuration-documents'
import { CONFIGURATION_DOCUMENTS, CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'

const NEARLY_FULL_PERCENT = 90

export function DocumentSizeNotes({
  configuration
}: {
  configuration: DeviceConfiguration
}): React.JSX.Element | null {
  const notes = useMemo(
    () =>
      CONFIGURATION_DOCUMENT_IDS.map((id) => ({
        id,
        percent: Math.ceil(
          (documentPayloadBytes(configuration, id) * 100) / CONFIGURATION_DOCUMENTS[id].maxPayload
        )
      })).filter((note) => note.percent >= NEARLY_FULL_PERCENT),
    [configuration]
  )
  if (notes.length === 0) return null
  return (
    <div className="space-y-0.5 text-[11px]">
      {notes.map(({ id, percent }) => {
        const label = t(`documents.label.${id}`)
        return percent > 100 ? (
          <p key={id} className="text-red-400">
            {t('dashboard.configsPage.documentTooBig', { label, percent })}
          </p>
        ) : (
          <p key={id} className="text-amber-300">
            {t('dashboard.configsPage.documentNearlyFull', { label, percent })}
          </p>
        )
      })}
    </div>
  )
}
