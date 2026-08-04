import { useEffect, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
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
    <div className="grid min-h-screen grid-rows-[3.5rem_1fr_2.5rem] bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-5">
        <div>
          <h1 className="text-sm font-semibold">SimCore Configurator</h1>
          <p className="text-xs text-muted-foreground">Desktop configuration workspace</p>
        </div>
        <DeviceConnection onDetailedStatusChange={setDeviceStatusText} />
      </header>

      <main className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <aside className="min-h-0 overflow-auto border-r p-3">
          <Card>
            <CardHeader>
              <CardTitle>Components</CardTitle>
              <CardDescription>Available widgets will appear here.</CardDescription>
            </CardHeader>
          </Card>
          <div className="mt-3">
            <FontAssetsPanel />
          </div>
        </aside>

        <section className="flex min-w-0 items-center justify-center bg-muted/30 p-6">
          <Card className="w-full max-w-2xl border-dashed bg-background/70">
            <CardHeader className="text-center">
              <CardTitle>Display editor</CardTitle>
              <CardDescription>
                The application foundation is ready. Editor behavior is intentionally not part of this phase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="mx-auto w-full rounded-md border bg-black"
                style={{
                  aspectRatio: deviceSession
                    ? `${deviceSession.info.display.width} / ${deviceSession.info.display.height}`
                    : '16 / 9'
                }}
              />
            </CardContent>
          </Card>
        </section>

        <aside className="border-l p-3">
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
