import { useEffect, useState } from 'react'

import wordmark from '@/assets/pitrig-wordmark.svg'
import { WorkspaceRail } from './workspace/WorkspaceRail'
import { useWorkspaceStore } from './workspace/workspace-store'
import { ConfigsPage } from '@/features/configuration/ConfigsPage'
import { DashboardWorkspace } from '@/features/configuration/DashboardWorkspace'
import { saveConfigurationFile } from '@/features/configuration/configuration-actions'
import { isTextEntry } from '@/features/configuration/editor/keyboard'
import { BoardSyncDialog } from '@/features/device/BoardSyncDialog'
import { useBoardSync, useBoardSyncStore } from '@/features/device/board-sync-store'
import { DeviceConnection } from '@/features/device/DeviceConnection'
import { useAppInfo } from '@/features/device/app-info'
import { useDraftState } from '@/features/device/draft-state'
import { InfoPage } from '@/features/device/InfoPage'
import { reportLiveApply } from '@/features/device/live-apply-store'
import { SafeModeBanner } from '@/features/device/SafeModeBanner'
import { UnresolvedFontsGate } from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { useLiveApply } from '@/features/device/use-live-apply'
import { useBoardPreview } from '@/features/modules/use-board-preview'
import { useModulesStore } from '@/features/modules/modules-store'
import { useDeviceStore } from '@/features/device/device-store'
import { FirmwarePage } from '@/features/firmware-update/FirmwarePage'
import { subscribeToFontLibrary } from '@/features/font-library/font-library-store'
import { ModulesPage } from '@/features/modules/ModulesPage'
import { ProtocolPage } from '@/features/protocol/ProtocolPage'
import { subscribeToTelemetryBridge } from '@/features/telemetry/bridge-store'
import { startLiveTelemetry } from '@/features/telemetry/live-telemetry'
import { TELEMETRY_BRIDGE_INCLUDED } from '@shared/telemetry-bridge'
import { t } from '@shared/ui-text'

export function App(): React.JSX.Element {
  const [deviceStatusText, setDeviceStatusText] = useState<string>()
  const appInfo = useAppInfo()
  const tab = useWorkspaceStore((state) => state.tab)
  const connectionRevision = useDeviceStore((state) => state.connectionRevision)
  const saving = useSaveToBoardStore((state) => state.running)
  const syncQuestion = useBoardSyncStore((state) => state.question)
  const { liveApplyAllowed, dirtyDocuments } = useDraftState()
  const layerPreview = useModulesStore((state) => state.preview)

  useEffect(() => subscribeToFontLibrary(), [])
  useEffect(() => (TELEMETRY_BRIDGE_INCLUDED ? subscribeToTelemetryBridge() : undefined), [])
  useEffect(() => (TELEMETRY_BRIDGE_INCLUDED ? startLiveTelemetry() : undefined), [])
  useBoardSync(dirtyDocuments)

  const mirroring = liveApplyAllowed && !saving && syncQuestion === undefined
  useLiveApply(mirroring && layerPreview.length === 0, reportLiveApply)
  useBoardPreview(mirroring)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      if (isTextEntry(event.target)) return
      event.preventDefault()
      void saveConfigurationFile()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="grid h-screen overflow-hidden grid-rows-[3.5rem_minmax(0,1fr)_2.5rem] bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-5">
        <img alt={t('app.app.pitrig')} src={wordmark} className="h-6 w-auto flex-none" />
        <DeviceConnection onDetailedStatusChange={setDeviceStatusText} />
      </header>

      <SafeModeBanner />

      <main className="flex min-h-0 overflow-hidden">
        <WorkspaceRail />
        <WorkspacePage key={`${tab}-${connectionRevision}`} />
      </main>

      <UnresolvedFontsGate />
      <BoardSyncDialog />

      <footer className="flex min-w-0 items-center justify-between gap-4 border-t px-5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{deviceStatusText ?? 'Application ready'}</span>
        <span className="flex-none">
          {appInfo ? t('app.app.nameVersion', { name: appInfo.name, version: appInfo.version }) : t('app.app.loadingApplicationInfo')}
        </span>
      </footer>
    </div>
  )
}

function WorkspacePage(): React.JSX.Element {
  const tab = useWorkspaceStore((state) => state.tab)
  switch (tab) {
    case 'dashboard':
      return <DashboardWorkspace />
    case 'info':
      return <InfoPage />
    case 'protocol':
      return <ProtocolPage />
    case 'configs':
      return <ConfigsPage />
    case 'modules':
      return <ModulesPage />
    case 'firmware':
      return <FirmwarePage />
  }
}
