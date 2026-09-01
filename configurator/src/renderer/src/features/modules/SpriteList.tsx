import { Images } from 'lucide-react'

import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { Hint } from '@/features/configuration/inspector/fields'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { mutateDevice } from './modules-document'

export function SpriteList({
  index,
  device
}: {
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const sprites = device.sprites ?? []
  const used = new Set((device.effects ?? []).map((effect) => effect.sprite))

  return (
    <Group
      id="LedMatrixPictures"
      title="Pictures"
      icon={Images}
      summary={`${sprites.length} picture(s)`}
      defaultOpen={sprites.length > 0}
    >
      {sprites.length === 0 ? (
        <Hint>
          None yet. Profiles bring their own artwork — adding the race flags to a panel installs
          the diagonal and chequered pictures they draw with.
        </Hint>
      ) : (
        sprites.map((sprite, position) => (
          <div key={position} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {sprite.id}
              <span className="ml-2 text-[10px] text-muted-foreground">
                {`${sprite.width ?? 8}×${sprite.height ?? 8} · ${sprite.frame_count ?? 1} frame(s)`}
              </span>
            </span>
            {used.has(sprite.id) ? (
              <span className="flex-none text-[10px] text-sky-300/80">in use</span>
            ) : null}
            <RemoveButton
              label={`Remove picture ${sprite.id}`}
              disabled={used.has(sprite.id)}
              onClick={() =>
                mutateDevice(index, (next) => {
                  const kept = (next.sprites ?? []).filter((entry) => entry.id !== sprite.id)
                  if (kept.length === 0) delete next.sprites
                  else next.sprites = kept
                })
              }
            />
          </div>
        ))
      )}
    </Group>
  )
}
