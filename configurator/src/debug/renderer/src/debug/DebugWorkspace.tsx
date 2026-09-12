import { Activity, Terminal } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { SubTabs, type SubTab } from '@/app/workspace/SubTabs'
import { DebugPage } from './DebugPage'
import { BenchPage } from './bench/BenchPage'
import { useBenchStore } from './bench/bench-store'
import { useDebugViewStore, type DebugView } from './debug-view-store'

const VIEWS: ReadonlyArray<SubTab<DebugView>> = [
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'bench', label: 'Bench', icon: Activity }
]

export function DebugWorkspace(): React.JSX.Element {
  const view = useDebugViewStore((state) => state.view)
  const setView = useDebugViewStore((state) => state.setView)
  const feed = useBenchStore((state) => state.samples.at(-1)?.feed ?? state.status.feed)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SubTabs
        label="Debug pages"
        tabs={VIEWS}
        value={view}
        onChange={setView}
        actions={
          feed.running ? (
            <Badge
              className="flex-none border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              variant="outline"
            >
              Feeding {feed.measuredRateHz.toFixed(0)} Hz
            </Badge>
          ) : null
        }
      />
      {view === 'console' ? <DebugPage /> : <BenchPage />}
    </div>
  )
}
