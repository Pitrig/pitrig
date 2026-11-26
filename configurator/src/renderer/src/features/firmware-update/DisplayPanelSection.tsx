import { useState } from 'react'

import { Select, type SelectOption } from '@/components/ui/select'
import { useBoardActivityReason } from '@/features/device/board-activity'
import { useDeviceStore } from '@/features/device/device-store'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { setDisplayPanel, type ActionFeedback } from '@/features/configuration/configuration-actions'
import { BOARD_PROFILES } from '@shared/device'
import type { DeviceDisplayPanel, DisplayPanel } from '@shared/display-panel'
import { t } from '@shared/ui-text'

const CHECK = 'check'

function panelLabel(panel: DisplayPanel): string {
  return panel === 'original'
    ? t('firmware.displayPanel.original')
    : t('firmware.displayPanel.since2026')
}

export function DisplayPanelSection({ blocked }: { blocked: boolean }): React.JSX.Element | null {
  const session = useDeviceStore((state) => state.session)
  const saving = useSaveToBoardStore((state) => state.running)
  const busyReason = useBoardActivityReason()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()

  const panels = session ? BOARD_PROFILES[session.info.boardId].displayPanels : undefined
  const current = session?.displayPanel
  if (!session || !panels || current === undefined) return null
  const options: SelectOption<string>[] = [
    ...panels.map((panel, index) => ({ value: String(index), label: panelLabel(panel) })),
    { value: CHECK, label: t('firmware.displayPanel.check') }
  ]

  const choose = async (value: string): Promise<void> => {
    const panel: DeviceDisplayPanel = value === CHECK ? CHECK : Number(value)
    if (panel === current) return
    setBusy(true)
    setFeedback(undefined)
    try {
      setFeedback(await setDisplayPanel(panel))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2 rounded-xl border bg-card px-4 py-3.5 text-xs text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{t('firmware.displayPanel.title')}</h3>
          <p className="mt-1 text-muted-foreground">
            {current === 'unsupported'
              ? t('firmware.displayPanel.needsFirmware')
              : current === CHECK
                ? t('firmware.displayPanel.asking')
                : t('firmware.displayPanel.description')}
          </p>
        </div>
        {current === 'unsupported' ? null : (
          <Select
            value={String(current)}
            options={options}
            onChange={(value) => void choose(value)}
            disabled={blocked || busy || saving || busyReason !== undefined}
            title={busyReason}
            aria-label={t('firmware.displayPanel.title')}
            className="w-56 flex-none"
          />
        )}
      </div>
      {feedback ? (
        <p className={`break-words text-[11px] ${feedback.kind === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  )
}
