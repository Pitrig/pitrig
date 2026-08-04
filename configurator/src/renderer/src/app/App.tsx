import { useEffect, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigurationPanel } from '@/features/configuration/ConfigurationPanel'
import { DisplayPreview } from '@/features/configuration/DisplayPreview'
import { DevelopmentLog } from '@/features/development/DevelopmentLog'
import { DeviceConnection } from '@/features/device/DeviceConnection'
import { useDeviceStore } from '@/features/device/device-store'
import { FontAssetsPanel } from '@/features/font-assets/FontAssetsPanel'
import type { AppInfo } from '../../../shared/ipc'

export function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [deviceStatusText, setDeviceStatusText] = useState<string>()
  const deviceSession = useDeviceStore((state) => state.session)

  useEffect(() => {
    void window.simcore.getAppInfo().then(setAppInfo)
  }, [])

  return (
    <div className="grid h-screen overflow-hidden grid-rows-[3.5rem_minmax(0,1fr)_2.5rem] bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-5">
        <div>
          <h1 className="text-sm font-semibold">SimCore Configurator</h1>
          <p className="text-xs text-muted-foreground">Desktop configuration workspace</p>
        </div>
        <DeviceConnection onDetailedStatusChange={setDeviceStatusText} />
      </header>

      <main className="grid min-h-0 overflow-hidden grid-cols-[24rem_minmax(0,1fr)_18rem]">
        <aside className="min-h-0 space-y-3 overflow-y-auto overscroll-contain border-r p-3">
          <ConfigurationPanel />
          <div className="mt-3">
            <FontAssetsPanel />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 items-start justify-center overflow-hidden bg-muted/30 p-6">
          <DisplayPreview />
        </section>

        <aside className="min-h-0 overflow-hidden border-l p-3">
          <Card>
            <CardHeader>
              <CardTitle>Device</CardTitle>
              <CardDescription>
                {deviceSession
                  ? 'Detected board capabilities are read-only.'
                  : 'Connect a SimCore device to load its configuration.'}
              </CardDescription>
            </CardHeader>
            {deviceSession ? (
              <CardContent className="space-y-3 text-xs">
                <ReadOnlyField label="Board" value={deviceSession.info.boardId} />
                <ReadOnlyField
                  label="Display"
                  value={`${deviceSession.info.display.width} × ${deviceSession.info.display.height}`}
                />
                <ReadOnlyField label="Firmware" value={deviceSession.info.firmwareVersion} />
                <ReadOnlyField label="Schema" value={String(deviceSession.info.schemaVersion)} />
                <ReadOnlyField
                  label="Configuration"
                  value={deviceSession.info.configurationSource}
                />
                <ReadOnlyField label="Generation" value={String(deviceSession.info.generation)} />
                <ReadOnlyField
                  label="Persistent storage"
                  value={deviceSession.info.storageAvailable ? 'Available' : 'Unavailable'}
                />
              </CardContent>
            ) : null}
          </Card>
        </aside>
      </main>

      {import.meta.env.DEV ? <DevelopmentLog /> : null}

      <footer className="flex min-w-0 items-center justify-between gap-4 border-t px-5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{deviceStatusText ?? 'Application ready'}</span>
        <span className="flex-none">
          {appInfo ? `${appInfo.name} ${appInfo.version}` : 'Loading application info…'}
        </span>
      </footer>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate rounded-md border bg-muted/40 px-2 py-1.5">{value}</span>
    </div>
  )
}
