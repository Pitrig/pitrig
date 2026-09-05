import wordmark from '@/assets/pitrig-wordmark.svg'
import { Cpu, Files, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DebugConfigsPage } from './configs/DebugConfigsPage'
import { DebugWorkspace } from './debug/DebugWorkspace'
import { subscribeToBench } from './debug/bench/bench-store'
import { useSerialTraffic } from './debug/use-serial-traffic'
import { SubTabs, type SubTab } from '@/app/workspace/SubTabs'
import { DeviceConnection } from '@/features/device/DeviceConnection'
import { SafeModeBanner } from '@/features/device/SafeModeBanner'
import { useAppInfo } from '@/features/device/app-info'
import { useDeviceStore } from '@/features/device/device-store'
import { FirmwarePage } from '@/features/firmware-update/FirmwarePage'

type DebugTab = 'debug' | 'firmware' | 'configs'

const TABS: ReadonlyArray<SubTab<DebugTab>> = [
  { id: 'debug', label: 'Debug', icon: Terminal },
  { id: 'firmware', label: 'Firmware', icon: Cpu },
  { id: 'configs', label: 'Configs', icon: Files }
]

export function App(): React.JSX.Element {
  const [deviceStatusText, setDeviceStatusText] = useState<string>()
  const [tab, setTab] = useState<DebugTab>('debug')
  const appInfo = useAppInfo()
  const connectionRevision = useDeviceStore((state) => state.connectionRevision)

  useEffect(() => subscribeToBench(), [])
  useSerialTraffic()

  return (
    <div className="grid h-screen overflow-hidden grid-rows-[3.5rem_minmax(0,1fr)_2.5rem] bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-5">
        <div className="flex items-center gap-2.5">
          <img alt="Pitrig" src={wordmark} className="h-6 w-auto flex-none" />
          <span className="text-sm font-semibold text-muted-foreground">Debugger</span>
        </div>
        <DeviceConnection onDetailedStatusChange={setDeviceStatusText} />
      </header>

      <SafeModeBanner />

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <SubTabs label="Debugger pages" tabs={TABS} value={tab} onChange={setTab} />
        <DebugPage key={`${tab}-${connectionRevision}`} tab={tab} />
      </main>

      <footer className="flex min-w-0 items-center justify-between gap-4 border-t px-5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{deviceStatusText ?? 'Debugger ready'}</span>
        <span className="flex-none">
          {appInfo ? `${appInfo.name} ${appInfo.version}` : 'Loading application info…'}
        </span>
      </footer>
    </div>
  )
}

function DebugPage({ tab }: { tab: DebugTab }): React.JSX.Element {
  switch (tab) {
    case 'debug':
      return <DebugWorkspace />
    case 'firmware':
      return <FirmwarePage />
    case 'configs':
      return <DebugConfigsPage />
  }
}
