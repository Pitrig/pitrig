import { useEffect } from 'react'
import { Cable, Grid3x3, Images, Layers, Lightbulb, Plus, Puzzle } from 'lucide-react'

import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { SubTabs } from '@/app/workspace/SubTabs'
import { useWorkspaceStore, type ModulesView } from '@/app/workspace/workspace-store'
import { ModulesStatusChip } from './preview-status'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { useDeviceStore } from '@/features/device/device-store'
import { BoardPicker } from '@/features/configuration/preview/BoardPicker'
import { boardName } from '@/features/configuration/board-labels'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import type {
  HardwareDeviceConfiguration,
  HardwareDeviceType
} from '@shared/configuration-schema'
import { EffectEditor } from './EffectEditor'
import { EffectList } from './EffectList'
import { LedPreview } from './LedPreview'
import { NoConfiguration } from './NoConfiguration'
import { OutputEditor } from './OutputEditor'
import { ProfilePicker } from './ProfilePicker'
import { SegmentEditor } from './SegmentEditor'
import { SpriteEditor } from './SpriteEditor'
import { SpriteList } from './SpriteList'
import { addDevice, canAddDevice, devicesOf, ledPinsOf, removeDevice } from './modules-document'
import { useModulesStore, type DeviceView } from './modules-store'

const TABS: ReadonlyArray<{ id: ModulesView; label: string; icon: typeof Lightbulb }> = [
  { id: 'leds', label: 'LEDs', icon: Lightbulb },
  { id: 'matrix', label: 'Matrix', icon: Grid3x3 }
]

const DEVICE_TABS: ReadonlyArray<{ id: DeviceView; label: string; icon: typeof Cable }> = [
  { id: 'wiring', label: 'Wiring', icon: Cable },
  { id: 'pictures', label: 'Pictures', icon: Images },
  { id: 'layers', label: 'Layers', icon: Layers }
]

const TYPE: Record<ModulesView, HardwareDeviceType> = {
  leds: 'rgb_strip',
  matrix: 'rgb_matrix'
}

export function ModulesPage(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const selected = useModulesStore((state) => state.output)
  const select = useModulesStore((state) => state.select)
  const effect = useModulesStore((state) => state.effect)
  const view = useWorkspaceStore((state) => state.modulesView)
  const setView = useWorkspaceStore((state) => state.setModulesView)
  const clearPreview = useModulesStore((state) => state.clearPreview)
  const deviceView = useModulesStore((state) => state.deviceView)
  const setDeviceView = useModulesStore((state) => state.setDeviceView)

  useEffect(() => () => clearPreview(), [clearPreview])

  const all = devicesOf(draft)
  const type = TYPE[view]
  const mine = all
    .map((device, index) => ({ device, index }))
    .filter(({ device }) => device.type === type)
  const active = mine.find(({ index }) => index === selected) ?? mine[0]
  const pins = ledPinsOf(draft)
  const noun = view === 'matrix' ? 'matrix' : 'strip'
  const matrix = active?.device.type === 'rgb_matrix'
  const tabs = DEVICE_TABS.filter((tab) => tab.id !== 'pictures' || matrix)
  const page = deviceView === 'pictures' && !matrix ? 'wiring' : deviceView

  return (
    <PageShell
      title="Modules"
      description="Peripherals beyond the display, each on its own data pin."
      actions={
        <>
          <BoardPicker />
          <ModulesStatusChip />
          <SaveToBoardButton />
        </>
      }
    >
      {!draft ? (
        <NoConfiguration />
      ) : (
        <>
          <SubTabs
            label="Modules view"
            tabs={TABS.map((tab) => ({
              ...tab,
              badge: (
                <span className="text-[10px] text-muted-foreground">
                  {all.filter((device) => device.type === TYPE[tab.id]).length}
                </span>
              )
            }))}
            value={view}
            onChange={(next) => {
              setView(next)
              select(-1)
            }}
          />
          <PageSection
            title={view === 'matrix' ? 'Matrices' : 'Strips'}
            description={`Each ${noun} owns one data pin and one transmit channel; a board drives four devices in all.`}
            actions={
              canAddDevice(draft) ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/5"
                  onClick={() => select(addDevice(draft, type))}
                >
                  <Plus className="size-3.5" /> {`Add ${noun}`}
                </button>
              ) : null
            }
          >
            {pins.length === 0 ? (
              <p className="pb-2 text-[11px] text-amber-400/80">
                {`${boardName(draft.board)} publishes no free pins for LEDs yet, so a device on it
                  would be refused by the firmware.`}
              </p>
            ) : null}
            {mine.length === 0 ? (
              <EmptyState
                icon={<Puzzle aria-hidden="true" className="size-6" />}
                title={view === 'matrix' ? 'No matrices' : 'No strips'}
              >
                <p>{`Nothing is wired yet. Add a ${noun} to describe its pin and what it shows.`}</p>
              </EmptyState>
            ) : (
              <div className="flex flex-wrap gap-1">
                {mine.map(({ device, index }) => (
                  <div
                    key={index}
                    className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${index === active?.index ? 'border-sky-500/50 bg-sky-500/10' : 'hover:bg-white/5'}`}
                  >
                    <button type="button" onClick={() => select(index)}>
                      {device.id || `${view === 'matrix' ? 'Matrix' : 'Strip'} ${index + 1}`}
                      <span className="ml-1 text-muted-foreground">pin {device.pin ?? '—'}</span>
                    </button>
                    <RemoveButton
                      label={`Remove device ${index + 1}`}
                      onClick={() => {
                        removeDevice(index)
                        clearPreview()
                        select(-1)
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </PageSection>

          {active ? (
            <>
              <LedPreview index={active.index} device={active.device} />
              <SubTabs
                label="Device view"
                tabs={tabs.map((tab) => ({
                  ...tab,
                  badge:
                    tab.id === 'layers' ? (
                      <span className="text-[10px] text-muted-foreground">
                        {(active.device.effects ?? []).length}
                      </span>
                    ) : tab.id === 'pictures' ? (
                      <span className="text-[10px] text-muted-foreground">
                        {(active.device.sprites ?? []).length}
                      </span>
                    ) : undefined
                }))}
                value={page}
                onChange={setDeviceView}
              />
              {page === 'wiring' ? (
                <PageSection
                  title="Wiring"
                  description="The pin, the shape and the limits of this device."
                >
                  <OutputEditor draft={draft} index={active.index} device={active.device} />
                  {active.device.type === 'rgb_strip' ? (
                    <SegmentEditor index={active.index} device={active.device} />
                  ) : null}
                </PageSection>
              ) : page === 'pictures' ? (
                <PicturesSection output={active.index} device={active.device} />
              ) : (
                <PageSection
                  title="What it shows"
                  description="Layers composed onto this device, or a profile that adds a ready-made one."
                >
                  <EffectList output={active.index} device={active.device}>
                    <ProfilePicker output={active.index} device={active.device} />
                  </EffectList>
                  {effect >= 0 && (active.device.effects ?? [])[effect] ? (
                    <EffectEditor output={active.index} device={active.device} index={effect} />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Pick a layer to edit what it paints.
                    </p>
                  )}
                </PageSection>
              )}
            </>
          ) : null}
        </>
      )}
    </PageShell>
  )
}

function PicturesSection({
  output,
  device
}: {
  output: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const selected = useModulesStore((state) => state.sprite)
  const sprite = (device.sprites ?? [])[selected]

  return (
    <PageSection
      title="Pictures"
      description="Artwork this panel draws, drawn here and carried inside the modules document."
    >
      <SpriteList output={output} device={device} />
      {sprite ? (
        <SpriteEditor output={output} device={device} at={selected} />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Pick a picture to draw it, or make a new one.
        </p>
      )}
    </PageSection>
  )
}
