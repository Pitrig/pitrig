import { type TrackMapWidgetConfiguration } from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { t } from '@shared/ui-text'
import { type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { TRACK_MAP_DEFAULTS } from '../preview/track-map-look'
import { authored } from './authored'
import { ConditionsEditor } from './ConditionsEditor'
import { CheckboxField, ColorField, NumberField, OptionalColorField, SliderField } from './fields'
import { Group } from './Group'
import { GROUP_ICONS } from './icons'
import { BoxEditor, TitleEditor } from './styling-editors'

type Widget = TrackMapWidgetConfiguration
type Update = (mutation: (next: Widget) => void) => void
type ColorKey = 'line_color' | 'car_color' | 'player_color'
type SizeKey = 'line_width_px' | 'car_size_px' | 'player_size_px'
type OptionalColorKey =
  | 'sector_mark_color'
  | 'pit_lane_color'
  | 'finish_line_color'
  | 'player_border_color'
  | 'ahead_color'
  | 'behind_color'
  | 'lapping_color'
  | 'lapped_color'
  | 'pit_car_color'
  | 'class_1_color'
  | 'class_2_color'
  | 'class_3_color'
  | 'class_4_color'

const CLASS_KEYS = ['class_1_color', 'class_2_color', 'class_3_color', 'class_4_color'] as const

interface FieldProps<K> {
  widget: Widget
  field: K
  label: string
  hint: string
  update: Update
}

function RequiredColor({ widget, field, label, hint, fallback, update }: FieldProps<ColorKey> & { fallback: string }): React.JSX.Element {
  return <ColorField label={label} hint={hint} value={widget[field] ?? fallback} modified={authored(widget[field], fallback)} onReset={() => update((next) => { delete next[field] })} onChange={(value) => update((next) => { next[field] = value })} />
}

function OptionalColor({ widget, field, label, hint, update }: FieldProps<OptionalColorKey>): React.JSX.Element {
  return <OptionalColorField label={label} hint={hint} value={widget[field]} onChange={(value) => update((next) => { if (value === undefined) delete next[field]; else next[field] = value })} />
}

function Size({ widget, field, label, hint, fallback, update }: FieldProps<SizeKey> & { fallback: number }): React.JSX.Element {
  return <NumberField label={label} hint={hint} suffix="px" value={widget[field] ?? fallback} {...fieldBounds('track_map', field)} modified={authored(widget[field], fallback)} onReset={() => update((next) => { delete next[field] })} onChange={(value) => update((next) => { next[field] = value })} />
}

function TrackGroup({ widget, update }: { widget: Widget; update: Update }): React.JSX.Element {
  const width = widget.line_width_px ?? TRACK_MAP_DEFAULTS.lineWidthPx
  return (
    <Group id="Track" title={t('inspector.trackMapEditor.track')} icon={GROUP_ICONS.track} hint={t('inspector.hints.trackMap.track')} summary={t('inspector.trackMapEditor.widthPx', { width })}>
      <RequiredColor widget={widget} field="line_color" label={t('inspector.trackMapEditor.line')} hint={t('inspector.hints.trackMap.line')} fallback={TRACK_MAP_DEFAULTS.lineColor} update={update} />
      <Size widget={widget} field="line_width_px" label={t('inspector.trackMapEditor.lineWidth')} hint={t('inspector.hints.trackMap.width')} fallback={TRACK_MAP_DEFAULTS.lineWidthPx} update={update} />
      <OptionalColor widget={widget} field="sector_mark_color" label={t('inspector.trackMapEditor.sectorMarks')} hint={t('inspector.hints.trackMap.sectorMarks')} update={update} />
      <OptionalColor widget={widget} field="pit_lane_color" label={t('inspector.trackMapEditor.pitLane')} hint={t('inspector.hints.trackMap.pitLane')} update={update} />
      <OptionalColor widget={widget} field="finish_line_color" label={t('inspector.trackMapEditor.finishLine')} hint={t('inspector.hints.trackMap.finishLine')} update={update} />
    </Group>
  )
}

function CarsGroup({ widget, update }: { widget: Widget; update: Update }): React.JSX.Element {
  const car = widget.car_size_px ?? TRACK_MAP_DEFAULTS.carSizePx
  const player = widget.player_size_px ?? TRACK_MAP_DEFAULTS.playerSizePx
  return (
    <Group id="Cars" title={t('inspector.trackMapEditor.cars')} icon={GROUP_ICONS.cars} summary={t('inspector.trackMapEditor.carsSummary', { car, player })}>
      <RequiredColor widget={widget} field="car_color" label={t('inspector.trackMapEditor.car')} hint={t('inspector.hints.trackMap.car')} fallback={TRACK_MAP_DEFAULTS.carColor} update={update} />
      <Size widget={widget} field="car_size_px" label={t('inspector.trackMapEditor.carSize')} hint={t('inspector.hints.trackMap.carSize')} fallback={TRACK_MAP_DEFAULTS.carSizePx} update={update} />
      <RequiredColor widget={widget} field="player_color" label={t('inspector.trackMapEditor.player')} hint={t('inspector.hints.trackMap.player')} fallback={TRACK_MAP_DEFAULTS.playerColor} update={update} />
      <Size widget={widget} field="player_size_px" label={t('inspector.trackMapEditor.playerSize')} hint={t('inspector.hints.trackMap.playerSize')} fallback={TRACK_MAP_DEFAULTS.playerSizePx} update={update} />
      <OptionalColor widget={widget} field="player_border_color" label={t('inspector.trackMapEditor.playerRing')} hint={t('inspector.hints.trackMap.playerRing')} update={update} />
      <OptionalColor widget={widget} field="ahead_color" label={t('inspector.trackMapEditor.ahead')} hint={t('inspector.hints.trackMap.ahead')} update={update} />
      <OptionalColor widget={widget} field="behind_color" label={t('inspector.trackMapEditor.behind')} hint={t('inspector.hints.trackMap.behind')} update={update} />
      <OptionalColor widget={widget} field="lapping_color" label={t('inspector.trackMapEditor.lapping')} hint={t('inspector.hints.trackMap.lapping')} update={update} />
      <OptionalColor widget={widget} field="lapped_color" label={t('inspector.trackMapEditor.lapped')} hint={t('inspector.hints.trackMap.lapped')} update={update} />
      <OptionalColor widget={widget} field="pit_car_color" label={t('inspector.trackMapEditor.pitCar')} hint={t('inspector.hints.trackMap.pitCar')} update={update} />
    </Group>
  )
}

function ClassesGroup({ widget, update }: { widget: Widget; update: Update }): React.JSX.Element {
  const set = CLASS_KEYS.filter((field) => widget[field] !== undefined).length
  return (
    <Group id="Classes" title={t('inspector.trackMapEditor.classes')} icon={GROUP_ICONS.classes} hint={t('inspector.hints.trackMap.classes')} summary={set === 0 ? t('common.none') : t('inspector.trackMapEditor.classesSummary', { count: set, maximum: CLASS_KEYS.length })} defaultOpen={set > 0}>
      {CLASS_KEYS.map((field, index) => (
        <OptionalColor key={field} widget={widget} field={field} label={t('inspector.trackMapEditor.classNumber', { number: index + 1 })} hint={t('inspector.hints.trackMap.classColor')} update={update} />
      ))}
    </Group>
  )
}

function layoutSummary(fitted: boolean, rotation: number): string {
  if (!fitted) return t('inspector.trackMapEditor.fixedRotation', { rotation })
  return rotation === 0 ? t('inspector.trackMapEditor.fitted') : t('inspector.trackMapEditor.fittedRotation', { rotation })
}

function LayoutGroup({ widget, update }: { widget: Widget; update: Update }): React.JSX.Element {
  const fitted = widget.fit_rotation ?? TRACK_MAP_DEFAULTS.fitRotation
  const rotation = widget.rotation_deg ?? TRACK_MAP_DEFAULTS.rotationDeg
  const refresh = widget.refresh_ms ?? TRACK_MAP_DEFAULTS.refreshMs
  const rotationBounds = fieldBounds('track_map', 'rotation_deg')
  const fitChanged = authored(widget.fit_rotation, TRACK_MAP_DEFAULTS.fitRotation)
  const rotationChanged = authored(widget.rotation_deg, TRACK_MAP_DEFAULTS.rotationDeg)
  const refreshChanged = authored(widget.refresh_ms, TRACK_MAP_DEFAULTS.refreshMs)
  return (
    <Group id="Layout" title={t('inspector.trackMapEditor.layout')} icon={GROUP_ICONS.rotation} summary={layoutSummary(fitted, rotation)} defaultOpen={fitChanged || rotationChanged || refreshChanged}>
      <CheckboxField label={t('inspector.trackMapEditor.fitRotation')} hint={t('inspector.hints.trackMap.fitRotation')} checked={fitted} modified={fitChanged} onReset={() => update((next) => { delete next.fit_rotation })} onChange={(checked) => update((next) => { if (checked) delete next.fit_rotation; else next.fit_rotation = false })} />
      <SliderField label={t('inspector.trackMapEditor.rotation')} hint={t('inspector.hints.trackMap.rotation')} suffix="degrees" value={rotation} min={rotationBounds.min ?? 0} max={rotationBounds.max ?? 359} modified={rotationChanged} onReset={() => update((next) => { delete next.rotation_deg })} onChange={(value) => update((next) => { next.rotation_deg = value })} />
      <NumberField label={t('inspector.trackMapEditor.refresh')} hint={t('inspector.hints.trackMap.refresh')} suffix="ms" value={refresh} {...fieldBounds('track_map', 'refresh_ms')} modified={refreshChanged} onReset={() => update((next) => { delete next.refresh_ms })} onChange={(value) => update((next) => { next.refresh_ms = value })} />
    </Group>
  )
}

export function TrackMapEditor({ selection, widget }: { selection: WidgetSelection; widget: Widget }): React.JSX.Element {
  const update: Update = (mutation) => mutateSelectedWidget(selection, (next) => mutation(next as Widget))
  return (
    <>
      <TrackGroup widget={widget} update={update} />
      <CarsGroup widget={widget} update={update} />
      <ClassesGroup widget={widget} update={update} />
      <LayoutGroup widget={widget} update={update} />
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}
