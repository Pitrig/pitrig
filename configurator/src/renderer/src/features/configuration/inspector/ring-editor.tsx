import { RING_CENTERING_VALUES } from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { isNeedleArc } from '@shared/configuration-access'
import { fittedRadius, type RingWidget } from './ring-geometry'
import { authored } from './authored'
import { t } from '@shared/ui-text'
import { NumberField, SelectField, SliderField } from './fields'

export function RingFields({ widget, owner, update }: { widget: RingWidget; owner: 'arc' | 'indicator'; update: (mutation: (next: RingWidget) => void) => void }): React.JSX.Element {
  const thickness = widget.thickness_px ?? 8
  const radius = widget.radius_px ?? 0
  const fitted = Math.round(fittedRadius(widget, thickness))
  const angleBounds = fieldBounds(owner, 'center_angle_deg')
  const sectorBounds = fieldBounds(owner, 'sector_deg')
  const radiusBounds = fieldBounds(owner, 'radius_px')
  const thicknessBounds = fieldBounds(owner, 'thickness_px')
  const offsetBounds = fieldBounds(owner, 'x_offset_px')
  const needle = isNeedleArc(widget)
  const centringField = !needle || authored(widget.centering, 'circle')
  const offsetFields = !needle || authored(widget.x_offset_px, 0) || authored(widget.y_offset_px, 0)
  const fittedCaption = needle
    ? t('inspector.ringEditor.followingTheBoxFittedPxLength', { fitted: fitted })
    : t('inspector.ringEditor.followingTheBoxFittedPx', { fitted: fitted })
  return (
    <>
      <SliderField label={t('inspector.ringEditor.centreAngle')} hint={t('inspector.hints.ring.centreAngle')} suffix="degrees" value={widget.center_angle_deg ?? 270} min={angleBounds.min ?? 0} max={angleBounds.max ?? 359} modified={authored(widget.center_angle_deg, 270)} onReset={() => update((next) => { delete next.center_angle_deg })} onChange={(value) => update((next) => { next.center_angle_deg = value })} />
      <SliderField label={t('inspector.ringEditor.sector')} hint={t('inspector.hints.ring.sector')} suffix="degrees" value={widget.sector_deg ?? 270} min={sectorBounds.min ?? 1} max={sectorBounds.max ?? 360} modified={authored(widget.sector_deg, 270)} onReset={() => update((next) => { delete next.sector_deg })} onChange={(value) => update((next) => { next.sector_deg = value })} />
      <SliderField label={t('inspector.ringEditor.thickness')} hint={t('inspector.hints.ring.thickness')} suffix="px" value={thickness} min={1} max={thicknessBounds.max ?? 2048} softMax={64} modified={authored(widget.thickness_px, 8)} onReset={() => update((next) => { delete next.thickness_px })} onChange={(value) => update((next) => { next.thickness_px = value })} />
      <NumberField
        label={needle ? t('inspector.ringEditor.length') : t('inspector.indicatorEditor.radius')}
        hint={needle ? t('inspector.hints.ring.length') : t('inspector.hints.ring.radius')}
        suffix="px"
        value={radius !== 0 ? radius : fitted}
        min={0}
        max={radiusBounds.max ?? 2048}
        caption={radius === 0 ? fittedCaption : undefined}
        modified={radius !== 0}
        onReset={() => update((next) => { delete next.radius_px })}
        onChange={(value) => update((next) => { if (value === 0) delete next.radius_px; else next.radius_px = value })}
      />
      {centringField ? (<SelectField label={t('inspector.ringEditor.centreOn')} hint={t('inspector.hints.ring.centering')} value={widget.centering ?? 'circle'} options={RING_CENTERING_VALUES} modified={authored(widget.centering, 'circle')} onReset={() => update((next) => { delete next.centering })} onChange={(value) => update((next) => { next.centering = value })} />) : null}
      {offsetFields ? (
        <>
          <NumberField label={t('inspector.ringEditor.xOffset')} hint={t('inspector.hints.ring.offset')} suffix="px" value={widget.x_offset_px ?? 0} min={offsetBounds.min ?? -2048} max={offsetBounds.max ?? 2048} modified={authored(widget.x_offset_px, 0)} onReset={() => update((next) => { delete next.x_offset_px })} onChange={(value) => update((next) => { if (value === 0) delete next.x_offset_px; else next.x_offset_px = value })} />
          <NumberField label={t('inspector.ringEditor.yOffset')} hint={t('inspector.hints.ring.offset')} suffix="px" value={widget.y_offset_px ?? 0} min={offsetBounds.min ?? -2048} max={offsetBounds.max ?? 2048} modified={authored(widget.y_offset_px, 0)} onReset={() => update((next) => { delete next.y_offset_px })} onChange={(value) => update((next) => { if (value === 0) delete next.y_offset_px; else next.y_offset_px = value })} />
        </>
      ) : null}
    </>
  )
}
