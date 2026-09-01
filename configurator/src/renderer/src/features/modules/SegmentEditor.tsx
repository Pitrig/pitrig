import { Route } from 'lucide-react'

import {
  LED_SEGMENT_DIRECTION_VALUES,
  MAXIMUM_LED_SEGMENTS,
  type HardwareDeviceConfiguration,
  type LedSegmentConfiguration
} from '@shared/configuration-schema'
import { segmentBoundsOf, stripLayout } from '@shared/led-render'
import { Group } from '@/features/configuration/inspector/Group'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { Hint, NumberInput, SelectInput } from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { carryGeometry, drawnOf, mutateDevice } from './modules-document'

const CELL = 22
const LAMP = 16

function ArrangementMap({
  device
}: {
  device: HardwareDeviceConfiguration
}): React.JSX.Element | null {
  const layout = stripLayout(device)
  if (!layout) return null
  const bounds = segmentBoundsOf(device)
  const runOf = (lamp: number): number =>
    Math.max(
      0,
      bounds.findIndex((run) => lamp >= run.start && lamp <= run.end)
    )
  const numbered = new Set<number>()
  for (const run of bounds) {
    numbered.add(run.start)
    numbered.add(run.end)
  }
  return (
    <div className="max-w-full overflow-auto">
      <div
        className="relative rounded border border-white/10 bg-black/40"
        style={{
          width: layout.width * CELL + (CELL - LAMP),
          height: layout.height * CELL + (CELL - LAMP)
        }}
      >
        {layout.positions.map((at, lamp) => (
          <span
            key={lamp}
            title={`lamp ${lamp + 1}`}
            className={`absolute flex items-center justify-center rounded-full text-[8px] leading-none ring-1 ring-inset ring-white/15 ${
              runOf(lamp) % 2 === 0 ? 'bg-white/15' : 'bg-sky-400/25'
            } ${numbered.has(lamp) ? 'font-semibold text-white' : 'text-transparent'}`}
            style={{
              width: LAMP,
              height: LAMP,
              left: at.x * CELL + (CELL - LAMP) / 2,
              top: at.y * CELL + (CELL - LAMP) / 2
            }}
          >
            {lamp + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SegmentEditor({
  index,
  device
}: {
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const runs = device.segments ?? []

  const apply = (mutate: (next: LedSegmentConfiguration[]) => void): void =>
    mutateDevice(index, (next) => {
      const before = drawnOf(next)
      const list = [...(next.segments ?? [])]
      mutate(list)
      if (list.length === 0) {
        delete next.segments
        return
      }
      next.segments = list
      next.count = list.reduce((total, run) => total + Math.max(1, run.count ?? 1), 0)
      carryGeometry(next, before, 0)
    })

  return (
    <Group
      id="LedStripArrangement"
      title="Arrangement"
      icon={Route}
      hint={HINTS.device.segments}
      summary={runs.length === 0 ? 'straight line' : `${runs.length} run(s)`}
      defaultOpen
    >
      {runs.length === 0 ? (
        <Hint>
          Drawn as a straight line. Describe the strip as runs — say 8 lamps up, 16 right, 8
          down — and the previews bend to match the mounting.
        </Hint>
      ) : (
        <>
          {runs.map((run, position) => (
            <PropertyRow key={position} label={`Run ${position + 1}`}>
              <div className="flex items-center gap-1">
                <NumberInput
                  title="Lamps in this run"
                  value={run.count ?? 1}
                  min={1}
                  onChange={(count) =>
                    apply((list) => {
                      list[position] = { ...list[position], count: Math.max(1, count) }
                    })
                  }
                />
                <SelectInput
                  value={run.direction ?? 'right'}
                  options={LED_SEGMENT_DIRECTION_VALUES}
                  onChange={(direction) =>
                    apply((list) => {
                      list[position] = { ...list[position], direction }
                    })
                  }
                />
                <RemoveButton
                  label={`Remove run ${position + 1}`}
                  onClick={() =>
                    apply((list) => {
                      list.splice(position, 1)
                    })
                  }
                />
              </div>
            </PropertyRow>
          ))}
          <ArrangementMap device={device} />
        </>
      )}
      {runs.length < MAXIMUM_LED_SEGMENTS ? (
        <AddButton
          label="Add run"
          onClick={() =>
            apply((list) => {
              list.push({
                count: list.length === 0 ? (device.count ?? 1) : 8,
                direction: 'right'
              })
            })
          }
        />
      ) : (
        <Hint>{`An arrangement holds at most ${MAXIMUM_LED_SEGMENTS} runs.`}</Hint>
      )}
    </Group>
  )
}
