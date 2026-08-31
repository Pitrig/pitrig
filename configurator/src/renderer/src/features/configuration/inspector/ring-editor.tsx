import { fieldBounds } from '@shared/validate/ranges'
import { fittedRadius, type RingWidget } from './ring-geometry'
import { authored } from './authored'
import { HINTS } from './hints'
import { SliderField } from './fields'

export function RingFields({ widget, owner, update }: { widget: RingWidget; owner: 'arc' | 'indicator'; update: (mutation: (next: RingWidget) => void) => void }): React.JSX.Element {
  const thickness = widget.thickness_px ?? 8
  const radius = widget.radius_px ?? 0
  const fitted = Math.round(fittedRadius(widget, thickness))
  const angleBounds = fieldBounds(owner, 'start_angle_deg')
  const sweepBounds = fieldBounds(owner, 'sweep_deg')
  const radiusBounds = fieldBounds(owner, 'radius_px')
  const thicknessBounds = fieldBounds(owner, 'thickness_px')
  const centerBounds = fieldBounds(owner, 'center_x_px')
  return (
    <>
      <SliderField label="Start" hint={HINTS.ring.start} suffix="degrees" value={widget.start_angle_deg ?? 135} min={angleBounds.min ?? 0} max={angleBounds.max ?? 359} modified={authored(widget.start_angle_deg, 135)} onReset={() => update((next) => { delete next.start_angle_deg })} onChange={(value) => update((next) => { next.start_angle_deg = value })} />
      <SliderField label="Sweep" hint={HINTS.ring.sweep} suffix="degrees" value={widget.sweep_deg ?? 270} min={sweepBounds.min ?? 1} max={sweepBounds.max ?? 360} modified={authored(widget.sweep_deg, 270)} onReset={() => update((next) => { delete next.sweep_deg })} onChange={(value) => update((next) => { next.sweep_deg = value })} />
      <SliderField label="Thickness" hint={HINTS.ring.thickness} suffix="px" value={thickness} min={1} max={thicknessBounds.max ?? 2048} softMax={64} modified={authored(widget.thickness_px, 8)} onReset={() => update((next) => { delete next.thickness_px })} onChange={(value) => update((next) => { next.thickness_px = value })} />
      <SliderField
        label="Radius"
        hint={HINTS.ring.radius}
        suffix="px"
        value={radius !== 0 ? radius : fitted}
        min={0}
        max={radiusBounds.max ?? 2048}
        softMax={Math.min(radiusBounds.max ?? 2048, Math.max(256, 4 * fitted))}
        caption={radius === 0 ? `Following the box — ${fitted} px. Dragging pins a radius of its own.` : `The box on its own would give ${fitted} px. Zero follows it again.`}
        modified={radius !== 0}
        onReset={() => update((next) => { delete next.radius_px })}
        onChange={(value) => update((next) => { if (value === 0) delete next.radius_px; else next.radius_px = value })}
      />
      <SliderField label="Centre X" hint={HINTS.ring.centre} suffix="px" value={widget.center_x_px ?? 0} min={centerBounds.min ?? -2048} max={centerBounds.max ?? 2048} softMin={-256} softMax={256} modified={authored(widget.center_x_px, 0)} onReset={() => update((next) => { delete next.center_x_px })} onChange={(value) => update((next) => { if (value === 0) delete next.center_x_px; else next.center_x_px = value })} />
      <SliderField label="Centre Y" hint={HINTS.ring.centre} suffix="px" value={widget.center_y_px ?? 0} min={centerBounds.min ?? -2048} max={centerBounds.max ?? 2048} softMin={-256} softMax={256} modified={authored(widget.center_y_px, 0)} onReset={() => update((next) => { delete next.center_y_px })} onChange={(value) => update((next) => { if (value === 0) delete next.center_y_px; else next.center_y_px = value })} />
    </>
  )
}
