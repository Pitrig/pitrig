import { CircleArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'

import { CONFIGURATION_SCHEMA_VERSION } from '@shared/configuration-schema'
import { useDeviceStore } from './device-store'
import { t } from '@shared/ui-text'

export function SchemaBanner(): React.JSX.Element | null {
  const schema = useDeviceStore((state) => state.session?.info.schemaVersion)
  if (schema === undefined || schema === CONFIGURATION_SCHEMA_VERSION) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-xs text-sky-200"
    >
      <CircleArrowUp aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sky-100">{t('device.schemaBanner.updateTheBoardFirmware')}</p>
        <p className="mt-0.5 text-sky-200/90">
          {t('device.schemaBanner.explanation', { schema, expected: CONFIGURATION_SCHEMA_VERSION })}
        </p>
      </div>
      {schema < CONFIGURATION_SCHEMA_VERSION ? (
        <Button
          className="h-7 flex-none"
          variant="outline"
          onClick={() => useWorkspaceStore.getState().setTab('firmware')}
        >
          {t('updates.banner.openFirmware')}
        </Button>
      ) : null}
    </div>
  )
}
