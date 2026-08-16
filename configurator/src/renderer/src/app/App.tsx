import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfigurationPanel } from '@/features/configuration/ConfigurationPanel'
import { DisplayPreview } from '@/features/configuration/DisplayPreview'
import { LayersPanel } from '@/features/configuration/LayersPanel'
import { useEditorShortcuts } from '@/features/configuration/use-editor-shortcuts'
import { WidgetInspector } from '@/features/configuration/WidgetInspector'
import { DevelopmentLog } from '@/features/development/DevelopmentLog'
import { DeviceConnection } from '@/features/device/DeviceConnection'
import { useDeviceStore } from '@/features/device/device-store'
import { FontAssetsPanel } from '@/features/font-assets/FontAssetsPanel'
import { SimHubProfilePanel } from '@/features/simhub/SimHubProfilePanel'
import type { DeviceSession } from '../../../shared/device'
import type { AppInfo } from '../../../shared/ipc'

export function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [deviceStatusText, setDeviceStatusText] = useState<string>()
  const deviceSession = useDeviceStore((state) => state.session)
  const connectionRevision = useDeviceStore((state) => state.connectionRevision)

  useEditorShortcuts()

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

      <main className="grid min-h-0 overflow-hidden grid-cols-[21rem_minmax(0,1fr)_20rem]">
        <aside className="min-h-0 space-y-3 overflow-y-auto overscroll-contain border-r p-3">
          <ConfigurationPanel key={`configuration-${connectionRevision}`} />
          <SimHubProfilePanel key={`simhub-${connectionRevision}`} />
          <div className="mt-3">
            <FontAssetsPanel key={`fonts-${connectionRevision}`} />
          </div>
          <DeviceInfo session={deviceSession} />
        </aside>

        <section className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-muted/30 p-3">
          <DisplayPreview />
        </section>

        <aside className="min-h-0 space-y-3 overflow-y-auto overscroll-contain border-l p-3">
          <LayersPanel key={`layers-${connectionRevision}`} />
          <WidgetInspector key={`inspector-${connectionRevision}`} />
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

function DeviceInfo({ session }: { session?: DeviceSession }): React.JSX.Element {
  const [clearingFonts, setClearingFonts] = useState(false)
  const [fontError, setFontError] = useState<string>()
  const fontAssets = session?.fontAssets

  const clearFonts = async (): Promise<void> => {
    if (!window.confirm(
      'Clear all uploaded fonts from the board? Configurations that reference them will not render correctly after reboot.'
    )) return
    setClearingFonts(true)
    setFontError(undefined)
    try {
      const result = await window.simcore.clearFontAssets()
      if (!result.ok) setFontError(result.error.message)
    } catch (error) {
      setFontError(error instanceof Error ? error.message : 'Failed to clear uploaded fonts.')
    } finally {
      setClearingFonts(false)
    }
  }

  return (
    <details className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-sm font-semibold">Device info</summary>
      <div className="border-t">
        <div className="px-6 py-4 text-xs text-muted-foreground">
          {session
            ? 'Detected board capabilities are read-only.'
            : 'Connect a SimCore device to load its information.'}
        </div>
        {session ? (
          <div className="space-y-3 px-6 pb-6 text-xs">
            <ReadOnlyField label="Board" value={session.info.boardId} />
            <ReadOnlyField
              label="Display"
              value={`${session.info.display.width} × ${session.info.display.height}`}
            />
            <ReadOnlyField label="Firmware" value={session.info.firmwareVersion} />
            <ReadOnlyField label="Schema" value={String(session.info.schemaVersion)} />
            <ReadOnlyField label="Configuration" value={session.info.configurationSource} />
            <ReadOnlyField label="Generation" value={String(session.info.generation)} />
            <ReadOnlyField
              label="Persistent storage"
              value={session.info.storageAvailable ? 'Available' : 'Unavailable'}
            />
            <div className="grid gap-1">
              <span className="text-muted-foreground">Uploaded fonts</span>
              {fontAssets ? (
                fontAssets.families.length > 0 ? (
                  <div className="space-y-1 rounded-md border bg-muted/20 p-2">
                    {fontAssets.families.map((family) => (
                      <div key={family} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate" title={family}>{family}</span>
                        <span className="flex-none text-muted-foreground">any size</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="rounded-md border bg-muted/40 px-2 py-1.5 text-muted-foreground">
                    None
                  </span>
                )
              ) : (
                <span className="rounded-md border bg-muted/40 px-2 py-1.5 text-muted-foreground">
                  Unsupported by firmware
                </span>
              )}
            </div>
            {fontAssets?.rebootRequired ? (
              <p className="text-amber-400">Reboot required to activate font changes.</p>
            ) : null}
            {fontError ? <p className="text-red-400">{fontError}</p> : null}
            {fontAssets ? (
              <Button
                className="w-full text-red-400 hover:text-red-300"
                disabled={
                  clearingFonts ||
                  !fontAssets.storageAvailable ||
                  !fontAssets.packageAvailable ||
                  fontAssets.rebootRequired
                }
                variant="outline"
                onClick={() => void clearFonts()}
              >
                {clearingFonts ? 'Clearing fonts…' : 'Clear uploaded fonts'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
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
