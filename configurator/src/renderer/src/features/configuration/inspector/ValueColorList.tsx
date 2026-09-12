import type { RgbColor } from '@shared/configuration-schema'
import { PropertyRow } from './PropertyRow'
import { ColorSwatchInput, Hint, NumberInput } from './fields'
import { AddButton, RemoveButton } from './widget-editors'
import { t } from '@shared/ui-text'

export interface ValueColorEntry {
  value: number
  color: RgbColor
}

export function ValueColorList({
  noun,
  valueTitle,
  entries,
  capacity,
  capacityNote,
  defaultColor,
  seedValue,
  onChange
}: {
  noun: string
  valueTitle: string
  entries: readonly ValueColorEntry[]
  capacity: number
  capacityNote: string
  defaultColor: RgbColor
  seedValue: (entries: readonly ValueColorEntry[]) => number
  onChange: (entries: readonly ValueColorEntry[]) => void
}): React.JSX.Element {
  const label = (position: number): string =>
    `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${position + 1}`
  return (
    <>
      {entries.map((entry, position) => (
        <PropertyRow key={position} label={label(position)}>
          <div className="flex items-center gap-1">
            <NumberInput
              title={valueTitle}
              value={entry.value}
              step="any"
              onChange={(value) =>
                onChange(entries.map((at, here) => (here === position ? { ...at, value } : at)))
              }
            />
            <ColorSwatchInput
              label={t('inspector.valueColorList.positionColour', { position: label(position) })}
              value={entry.color}
              onChange={(color) =>
                onChange(entries.map((at, here) => (here === position ? { ...at, color } : at)))
              }
            />
            <RemoveButton
              label={t('inspector.valueColorList.removeNounPosition', { noun, position: position + 1 })}
              onClick={() => onChange(entries.filter((_, here) => here !== position))}
            />
          </div>
        </PropertyRow>
      ))}
      {entries.length < capacity ? (
        <AddButton
          label={t('modules.modulesPage.addNoun', { noun: noun })}
          onClick={() => onChange([...entries, { value: seedValue(entries), color: defaultColor }])}
        />
      ) : (
        <Hint>{capacityNote}</Hint>
      )}
    </>
  )
}
