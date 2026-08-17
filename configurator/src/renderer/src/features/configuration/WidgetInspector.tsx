import { useEffect, useId, useRef, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { screensOf, screenWidgetsOf } from '../../../../shared/configuration-access'
import {
  BAR_ORIENTATION_VALUES,
  COLOR_RAMP_TARGET_VALUES,
  CONDITION_OPERATOR_VALUES,
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_GRAPH_POINTS,
  MAXIMUM_INDICATOR_SEGMENTS,
  MAXIMUM_TEXT_SOURCES,
  MAXIMUM_ACTIONS,
  MAXIMUM_SLOTS,
  GRADIENT_DIRECTION_VALUES,
  MAXIMUM_WIDGET_CONDITIONS,
  SHAPE_KIND_VALUES,
  WIDGET_ACTION_TYPE_VALUES,
  WIDGET_ID_CAPACITY,
  type ArcWidgetConfiguration,
  type BarOrientation,
  type BarWidgetConfiguration,
  type ColorRampTarget,
  type ColorStop,
  type GraphWidgetConfiguration,
  type ImageWidgetConfiguration,
  type IndicatorWidgetConfiguration,
  type ConditionOperator,
  type FontSpec,
  type GradientDirection,
  type RgbColor,
  type ShapeKind,
  type ShapeWidgetConfiguration,
  type TextSourceConfiguration,
  type TextWidgetConfiguration,
  type ValueSourceConfiguration,
  type ValueTransform,
  type WidgetAction,
  type WidgetActionType,
  type WidgetCondition,
  type WidgetConfiguration,
  type WidgetPlacement
} from '../../../../shared/configuration-schema'

// Every widget carries the shared frame, so the box and the styling rules are
// edited by the same two components for all of them.
type FramedWidget =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration
import type { DeviceConfiguration } from '../../../../shared/device'
import {
  TELEMETRY_CATALOG,
  type TelemetryCatalogEntry
} from '../../../../shared/telemetry-catalog'
import {
  MAXIMUM_TRANSFORM_DECIMALS,
  unitPresetsFor
} from '../../../../shared/value-transform'
import {
  BOOLEAN_OPERATORS,
  MAXIMUM_BLINK_MS,
  MAXIMUM_HOLD_MS,
  MINIMUM_BLINK_MS
} from '../../../../shared/widget-conditions'
import {
  actionCount,
  completePlacement,
  groupById,
  mutateActiveScreen,
  mutateGroup,
  renameGroup,
  renameScreen,
  mutateSelectedWidget,
  selectedGroupId,
  selectedWidget,
  useDashboardEditorStore,
  type WidgetSelection
} from './dashboard-editor'

export function WidgetInspector(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const widget = selectedWidget(configuration, selection)
  // Everything the inspector offers belongs to the screen being edited, and the
  // subscribed index is what makes it follow a screen change.
  const groupId = selectedGroupId(configuration, selection)
  const screen = screensOf(configuration)[activeScreenIndex]
  const widgets = screenWidgetsOf(screen)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget inspector</CardTitle>
        <CardDescription>Select a widget on the display, then edit its properties.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <label className="block space-y-1 text-muted-foreground">
          <span>Selected widget</span>
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
            value={selectionValue(selection)}
            onChange={(event) => select(parseSelection(event.target.value))}
          >
            <option value="">None</option>
            <option value="screen">Screen</option>
            {widgets.map((item, index) => (
              <option key={item.id ?? index} value={`widget:${item.id ?? ''}`}>
                {widgetLabel(item, index)}
              </option>
            ))}
          </select>
        </label>

        {!configuration ? <Hint>Fix the JSON draft before using the visual editor.</Hint> : null}
        {configuration && selection?.type === 'screen' ? (
          <ScreenEditor configuration={configuration} />
        ) : null}
        {configuration && selection?.type === 'widget' && !widget ? <Hint>Select an existing widget on the display.</Hint> : null}
        {configuration && selection?.type === 'group' && groupId ? (
          <GroupEditor groupId={groupId} configuration={configuration} />
        ) : null}
        {configuration && widget && selection?.type === 'widget' ? (
          <>
            <GeometryEditor selection={selection} placement={completePlacement(widget.placement)} zIndex={widget.z_index ?? 0} />
            {widget.type === 'bar' ? (
              <BarEditor selection={selection} widget={widget} />
            ) : widget.type === 'arc' ? (
              <ArcEditor selection={selection} widget={widget} />
            ) : widget.type === 'indicator' ? (
              <IndicatorEditor selection={selection} widget={widget} />
            ) : widget.type === 'graph' ? (
              <GraphEditor selection={selection} widget={widget} />
            ) : widget.type === 'image' ? (
              <ImageEditor selection={selection} widget={widget} />
            ) : widget.type === 'shape' ? (
              <ShapeEditor selection={selection} widget={widget} />
            ) : (
              <TextEditor selection={selection} widget={widget} />
            )}
            <ActionEditor
              configuration={configuration}
              action={widget.action}
              disabledReason={undefined}
              onChange={(action) =>
                mutateSelectedWidget(selection, (target) => {
                  if (action) target.action = action
                  else delete target.action
                })
              }
            />
            {groupId ? <GroupEditor groupId={groupId} configuration={configuration} /> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

// The list has to name a widget before it is selected, so each type answers
// with whatever identifies it best.
function widgetLabel(widget: WidgetConfiguration, index: number): string {
  switch (widget.type) {
    case 'shape':
      return `Shape ${index + 1}: ${widget.kind ?? 'rectangle'}`
    case 'bar':
      return `Bar ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'arc':
      return `Arc ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'indicator':
      return `Lights ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'graph':
      return `Graph ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'image':
      return `Image ${index + 1}: ${widget.image || 'Unassigned'}`
    case 'text':
      return `Text ${index + 1}: ${widget.title?.text || widget.sources?.[0]?.binding || 'Untitled'}`
  }
}

// Every gauge reads one source through one window, so they share the section
// that binds it rather than each spelling it out.
interface RangedWidget {
  source?: ValueSourceConfiguration
  minimum?: number
  maximum?: number
}

function SourceRangeSection<T extends RangedWidget>({ widget, update }: { widget: T; update: (mutation: (next: T) => void) => void }): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.source?.binding)
  const unit = binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
  return (
    <Section title="Data">
      <TelemetryBindingField value={widget.source?.binding ?? ''} onChange={(value) => update((next) => {
        next.source = { ...next.source, binding: value }
      })} />
      <SelectField label="Modifier" value={widget.source?.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => update((next) => {
        if (value === 'lap_timer') next.source = { binding: 'session.lap.current_time', modifiers: [{ type: 'lap_timer' }] }
        else if (next.source) delete next.source.modifiers
      })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={`Minimum${unit}`} value={widget.minimum ?? 0} step="any" onChange={(value) => update((next) => { next.minimum = value })} />
        <NumberField label={`Maximum${unit}`} value={widget.maximum ?? 1} step="any" onChange={(value) => update((next) => { next.maximum = value })} />
      </div>
    </Section>
  )
}

function ArcEditor({ selection, widget }: { selection: WidgetSelection; widget: ArcWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ArcWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ArcWidgetConfiguration))
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Section title="Arc">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Start angle (deg)" value={widget.start_angle_deg ?? 135} min={0} max={359} onChange={(value) => update((next) => { next.start_angle_deg = value })} />
          <NumberField label="Sweep (deg)" value={widget.sweep_deg ?? 270} min={1} max={360} onChange={(value) => update((next) => { next.sweep_deg = value })} />
        </div>
        <p className="text-muted-foreground">Zero degrees is three o&apos;clock and the angle grows clockwise, so 135 with a 270 sweep is the usual car gauge.</p>
        <NumberField label="Thickness (px)" value={widget.thickness_px ?? 8} min={1} onChange={(value) => update((next) => { next.thickness_px = value })} />
        <ColorField label="Fill color" value={widget.fill_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.fill_color = value })} />
        <OptionalColorField label="Track color" value={widget.track_color} onChange={(value) => update((next) => { if (value === undefined) delete next.track_color; else next.track_color = value })} />
        <CheckboxField label="Sweep from the far end" checked={widget.inverted ?? false} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

function IndicatorEditor({ selection, widget }: { selection: WidgetSelection; widget: IndicatorWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: IndicatorWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as IndicatorWidgetConfiguration))
  const segments = widget.segments ?? []
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Section title="Strip">
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} onChange={(value) => update((next) => { next.orientation = value as BarOrientation })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Gap (px)" value={widget.segment_gap_px ?? 4} min={0} onChange={(value) => update((next) => { next.segment_gap_px = value })} />
          <NumberField label="Radius (px)" value={widget.segment_radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.segment_radius_px = value })} />
        </div>
        <OptionalColorField label="Unlit color" value={widget.off_color} onChange={(value) => update((next) => { if (value === undefined) delete next.off_color; else next.off_color = value })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Blink from" value={widget.blink_threshold ?? 2} step="any" onChange={(value) => update((next) => { next.blink_threshold = value })} />
          <NumberField label="Blink (ms)" value={widget.blink_ms ?? 0} min={0} max={MAXIMUM_BLINK_MS} onChange={(value) => update((next) => { next.blink_ms = value })} />
        </div>
        <p className="text-muted-foreground">Blinking starts at this fraction of the range; above 1 it never blinks, and so does a zero period.</p>
      </Section>
      <Section title="Segments">
        <p className="text-muted-foreground">Each lamp lights at its fraction of the range, so one strip suits any engine. Thresholds must not decrease.</p>
        {segments.map((segment, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <NumberField label={`Lamp ${index + 1}`} value={segment.threshold ?? 0} step="any" min={0} max={1} onChange={(value) => update((next) => {
              const list = [...(next.segments ?? [])]
              list[index] = { ...list[index], threshold: value }
              next.segments = list
            })} />
            <ColorField label="Color" value={segment.color ?? '#00C853'} onChange={(value) => update((next) => {
              const list = [...(next.segments ?? [])]
              list[index] = { ...list[index], color: value }
              next.segments = list
            })} />
            <button className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => update((next) => {
              next.segments = (next.segments ?? []).filter((_, position) => position !== index)
            })}>Remove</button>
          </div>
        ))}
        {segments.length < MAXIMUM_INDICATOR_SEGMENTS ? (
          <button className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => update((next) => {
            const list = next.segments ?? []
            const previous = list[list.length - 1]
            next.segments = [...list, { threshold: previous?.threshold ?? 0, color: previous?.color ?? '#00C853' }]
          })}>Add lamp</button>
        ) : <Hint>{`A strip holds at most ${MAXIMUM_INDICATOR_SEGMENTS} lamps.`}</Hint>}
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

function ImageEditor({ selection, widget }: { selection: WidgetSelection; widget: ImageWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ImageWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ImageWidgetConfiguration))
  const installed = useDeviceStore((state) => state.session?.imageAssets?.images) ?? []
  const known = installed.find(({ name }) => name === widget.image)
  return (
    <>
      <Section title="Image">
        <SelectField label="Uploaded image" value={widget.image ?? ''} options={['', ...installed.map(({ name }) => name)]} onChange={(value) => update((next) => { if (value) next.image = value; else delete next.image })} />
        {installed.length === 0 ? <Hint>Upload images to the board to choose one here.</Hint> : null}
        {widget.image && !known && installed.length > 0 ? <Hint>{`"${widget.image}" is not installed on the connected board, so the device will refuse this configuration.`}</Hint> : null}
        {known ? <p className="text-muted-foreground">{`${known.width} × ${known.height} · ${known.format}. The device draws it at the size it was uploaded at, so match the widget to it.`}</p> : null}
        <OptionalColorField label="Recolor" value={widget.recolor} onChange={(value) => update((next) => { if (value) next.recolor = value; else { delete next.recolor; delete next.recolor_opa } })} />
        {widget.recolor ? <NumberField label="Recolor strength (0-255)" value={widget.recolor_opa ?? 255} min={0} max={255} onChange={(value) => update((next) => { next.recolor_opa = Math.min(255, Math.max(0, Math.round(value))) })} /> : null}
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

function GraphEditor({ selection, widget }: { selection: WidgetSelection; widget: GraphWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: GraphWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as GraphWidgetConfiguration))
  const points = widget.point_count ?? 64
  const interval = widget.sample_interval_ms ?? 100
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Section title="Trace">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Points" value={points} min={2} max={MAXIMUM_GRAPH_POINTS} onChange={(value) => update((next) => { next.point_count = value })} />
          <NumberField label="Interval (ms)" value={interval} min={1} onChange={(value) => update((next) => { next.sample_interval_ms = value })} />
        </div>
        <p className="text-muted-foreground">{`Shows the last ${((points * interval) / 1000).toFixed(1)} s. The trace is the most expensive widget to draw, so keep the point count only as high as it needs to be.`}</p>
        <ColorField label="Line color" value={widget.line_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.line_color = value })} />
        <NumberField label="Line width (px)" value={widget.line_width_px ?? 2} min={1} onChange={(value) => update((next) => { next.line_width_px = value })} />
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

function BarEditor({ selection, widget }: { selection: WidgetSelection; widget: BarWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: BarWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as BarWidgetConfiguration))
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.source?.binding)
  const unit = binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
  return (
    <>
      <Section title="Data">
        <TelemetryBindingField value={widget.source?.binding ?? ''} onChange={(value) => update((next) => {
          next.source = { ...next.source, binding: value }
        })} />
        <SelectField label="Modifier" value={widget.source?.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => update((next) => {
          if (value === 'lap_timer') next.source = { binding: 'session.lap.current_time', modifiers: [{ type: 'lap_timer' }] }
          else if (next.source) delete next.source.modifiers
        })} />
        <p className="text-muted-foreground">The fill is the value's place in this window, clamped at both ends.</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`Minimum${unit}`} value={widget.minimum ?? 0} step="any" onChange={(value) => update((next) => { next.minimum = value })} />
          <NumberField label={`Maximum${unit}`} value={widget.maximum ?? 1} step="any" onChange={(value) => update((next) => { next.maximum = value })} />
        </div>
        <CheckboxField label="Fill from a value" checked={widget.origin !== undefined} onChange={(checked) => update((next) => { if (checked) next.origin = 0; else delete next.origin })} />
        {widget.origin !== undefined ? (
          <>
            <NumberField label={`Origin${unit}`} value={widget.origin} step="any" onChange={(value) => update((next) => { next.origin = value })} />
            <p className="text-muted-foreground">The fill runs between this value and the current one, so a signed window with a zero origin reads as a centred meter.</p>
          </>
        ) : null}
      </Section>
      <Section title="Bar">
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} onChange={(value) => update((next) => { next.orientation = value as BarOrientation })} />
        <CheckboxField label="Fill from the far end" checked={widget.inverted ?? false} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
        <ColorField label="Fill color" value={widget.fill_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.fill_color = value })} />
        {/* The fill's gradient runs along the bar's own axis, so it needs no
            direction of its own. */}
        <OptionalColorField
          label="Fill gradient to"
          value={widget.fill_grad_color}
          onChange={(value) =>
            update((next) => {
              if (value) next.fill_grad_color = value
              else delete next.fill_grad_color
            })
          }
        />
        <p className="text-muted-foreground">The box background below is the track the fill runs over.</p>
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

// A shape is its frame, so its own section is one property; the box and the
// styling rules come from the shared frame editors below.
function ShapeEditor({ selection, widget }: { selection: WidgetSelection; widget: ShapeWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ShapeWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ShapeWidgetConfiguration))
  return (
    <>
      <Section title="Shape">
        <SelectField label="Kind" value={widget.kind ?? 'rectangle'} options={SHAPE_KIND_VALUES} onChange={(value) => update((next) => { next.kind = value as ShapeKind })} />
        <p className="text-muted-foreground">A line is a thin rectangle: give it a small height or width.</p>
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

/**
 * What a tap does. Carried by widgets and by groups alike, so the editor for it
 * is one component: a readout that doubles as a button and a rectangle of the
 * screen are the same thing to the device.
 *
 * The board reaches this only where there is a digitizer, which the hint says
 * rather than the editor hiding the section on those boards — a document is
 * authored for the dashboard, not for the plate it is being edited on.
 */
function ActionEditor({
  configuration,
  action,
  disabledReason,
  onChange
}: {
  configuration: DeviceConfiguration
  action?: WidgetAction
  disabledReason?: string
  onChange: (action: WidgetAction | undefined) => void
}): React.JSX.Element {
  const type = action?.type ?? 'none'
  const screens = screensOf(configuration)
  const atCapacity = actionCount(configuration) >= MAXIMUM_ACTIONS && type === 'none'
  return (
    <Section title="Action">
      {disabledReason ? (
        <p className="text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <SelectField
            label="On tap"
            value={type}
            options={WIDGET_ACTION_TYPE_VALUES}
            onChange={(next) => {
              if (next === 'none') {
                onChange(undefined)
                return
              }
              if (next === 'goto_screen') {
                onChange({ type: 'goto_screen', screen: screens[0]?.id ?? '' })
                return
              }
              // The other types name no screen, and one that does is rejected
              // by the device rather than ignored.
              onChange({ type: next as WidgetActionType })
            }}
          />
          {type === 'goto_screen' ? (
            <SelectField
              label="Go to screen"
              value={action?.screen ?? ''}
              options={screens.map((screen, index) => screen.id ?? `screen${index + 1}`)}
              onChange={(screen) => onChange({ type: 'goto_screen', screen })}
            />
          ) : null}
          {atCapacity ? (
            <p className="text-muted-foreground">
              {`This dashboard already uses all ${MAXIMUM_ACTIONS} tap targets.`}
            </p>
          ) : null}
        </>
      )}
    </Section>
  )
}

/**
 * The group the selected widget belongs to. A group is reached through its
 * widgets rather than through a selection type of its own: what the author
 * clicks on is always a widget, and the group is the parent behind it.
 *
 * Nothing shows for a widget on the screen itself, which is what "not in a
 * group" looks like.
 */
function GroupEditor({
  groupId,
  configuration
}: {
  groupId: string
  configuration: DeviceConfiguration
}): React.JSX.Element | null {
  const group = groupById(configuration, groupId)
  if (!group) return null
  const box = group.placement ?? {}
  const slot = group.slot ?? 0
  return (
    <Section title="Group">
      <IdField
        key={group.id ?? groupId}
        label="Name"
        value={group.id ?? ''}
        onCommit={(name) => renameGroup(groupId, name)}
      />
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <NumberField
            key={key}
            label={key}
            value={box[key] ?? 0}
            onChange={(value) =>
              mutateGroup(groupId, (target) => {
                target.placement = { ...target.placement, [key]: value }
              })
            }
          />
        ))}
      </div>
      <NumberField
        label="Stacking (z-index among the screen's widgets)"
        value={group.z_index ?? 0}
        onChange={(z_index) =>
          mutateGroup(groupId, (target) => {
            if (z_index === 0) delete target.z_index
            else target.z_index = z_index
          })
        }
      />
      <NumberField
        label="Slot (0 = always visible)"
        value={slot}
        min={0}
        max={MAXIMUM_SLOTS}
        onChange={(value) =>
          mutateGroup(groupId, (target) => {
            if (value <= 0) {
              delete target.slot
              delete target.slot_default
              return
            }
            target.slot = value
          })
        }
      />
      <ActionEditor
        configuration={configuration}
        action={group.action}
        disabledReason={
          slot > 0
            ? 'A group in a slot spends its tap on cycling, so it cannot navigate as well.'
            : undefined
        }
        onChange={(action) =>
          mutateGroup(groupId, (target) => {
            if (action) target.action = action
            else delete target.action
          })
        }
      />
      {slot > 0 ? (
        <>
          <CheckboxField
            label="Shown first in this slot"
            checked={group.slot_default === true}
            onChange={(checked) =>
              mutateGroup(groupId, (target) => {
                if (checked) target.slot_default = true
                else delete target.slot_default
              })
            }
          />
          <p className="text-muted-foreground">
            Groups sharing a slot must share this box, and exactly one of them must be shown
            first. Tapping the slot on the board cycles to the next group; a matching rule below
            overrides that while it holds.
          </p>
          <TelemetryBindingField
            value={group.condition_source?.binding ?? ''}
            onChange={(binding) =>
              mutateGroup(groupId, (target) => {
                if (!binding) delete target.condition_source
                else target.condition_source = { ...target.condition_source, binding }
              })
            }
          />
          {(group.conditions ?? []).map((rule, index) => (
            <div key={index} className="grid grid-cols-[6rem_1fr_5rem_auto] items-end gap-2">
              <SelectField
                label="When"
                value={rule.op ?? 'above'}
                options={CONDITION_OPERATOR_VALUES}
                onChange={(op) =>
                  mutateGroup(groupId, (target) => {
                    const rules = target.conditions ?? []
                    rules[index] = { ...rules[index], op: op as ConditionOperator }
                    target.conditions = rules
                  })
                }
              />
              <NumberField
                label="Value"
                value={rule.value ?? 0}
                step="any"
                onChange={(value) =>
                  mutateGroup(groupId, (target) => {
                    const rules = target.conditions ?? []
                    rules[index] = { ...rules[index], value }
                    target.conditions = rules
                  })
                }
              />
              <NumberField
                label="Hold ms"
                value={rule.hold_ms ?? 0}
                min={0}
                max={MAXIMUM_HOLD_MS}
                onChange={(hold_ms) =>
                  mutateGroup(groupId, (target) => {
                    const rules = target.conditions ?? []
                    rules[index] = { ...rules[index], hold_ms }
                    target.conditions = rules
                  })
                }
              />
              <button
                type="button"
                className="h-8 rounded-md border px-2 hover:bg-muted"
                onClick={() =>
                  mutateGroup(groupId, (target) => {
                    const rules = (target.conditions ?? []).filter((_, at) => at !== index)
                    if (rules.length === 0) delete target.conditions
                    else target.conditions = rules
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {(group.conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
            <button
              type="button"
              className="h-8 rounded-md border px-2 hover:bg-muted"
              onClick={() =>
                mutateGroup(groupId, (target) => {
                  target.conditions = [...(target.conditions ?? []), { op: 'above', value: 0 }]
                })
              }
            >
              Add activation rule
            </button>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const screen = screensOf(configuration)[activeScreenIndex]
  return (
    <Section title={`Screen ${activeScreenIndex + 1}`}>
      {/* A screen's name is what a goto_screen action points at, so it is worth
          setting to something the dashboard means. Renaming repoints every
          action that named it. */}
      <IdField
        key={screen?.id ?? activeScreenIndex}
        label="Name"
        value={screen?.id ?? `screen${activeScreenIndex + 1}`}
        onCommit={(name) => renameScreen(activeScreenIndex, name)}
      />
      <ColorField
        label="Background color"
        value={screensOf(configuration)[activeScreenIndex]?.background_color ?? '#000000'}
        onChange={(background_color) =>
          mutateActiveScreen((screen) => {
            screen.background_color = background_color
          })
        }
      />
    </Section>
  )
}

function GeometryEditor({ selection, placement, zIndex }: { selection: WidgetSelection; placement?: Required<WidgetPlacement>; zIndex: number }): React.JSX.Element {
  const update = (key: keyof Required<WidgetPlacement>, value: number): void => mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...widget.placement, [key]: value }
  })
  return (
    <Section title="Geometry">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <NumberField key={key} label={key.toUpperCase()} value={placement?.[key] ?? 0} min={key === 'width' || key === 'height' ? 1 : 0} onChange={(value) => update(key, value)} />
        ))}
      </div>
      <NumberField label="Z" value={zIndex} min={-32768} max={32767} onChange={(value) => mutateSelectedWidget(selection, (widget) => {
        widget.z_index = Math.min(32767, Math.max(-32768, value))
      })} />
    </Section>
  )
}

function TextEditor({ selection, widget }: { selection: WidgetSelection; widget: TextWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: TextWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as TextWidgetConfiguration))
  const sources = widget.sources ?? []
  return (
    <>
      <Section title="Data">
        <p className="text-muted-foreground">
          Sources render in order, each through its own transform. A prefix or suffix is what
          separates one from the next, so {'"P 3/24"'} is a position source followed by a
          participants source prefixed with {'"/"'}.
        </p>
        {sources.map((source, index) => (
          <SourceEditor
            key={index}
            source={source}
            index={index}
            removable={sources.length > 1}
            onChange={(mutation) => update((next) => {
              const list = next.sources ?? []
              if (list[index]) mutation(list[index])
            })}
            onRemove={() => update((next) => {
              next.sources = (next.sources ?? []).filter((_, position) => position !== index)
            })}
          />
        ))}
        {sources.length < MAXIMUM_TEXT_SOURCES ? (
          <button
            type="button"
            className="h-8 w-full rounded-md border text-foreground"
            onClick={() => update((next) => {
              next.sources = [...(next.sources ?? []), {}]
            })}
          >
            Add source
          </button>
        ) : null}
      </Section>
      <ConditionsEditor widget={widget} update={update} />
      <Section title="Value">
        <FontEditor font={widget.value?.font} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <SelectField label="Alignment" value={widget.value?.alignment ?? 'center'} options={['left', 'center', 'right']} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value as 'left' | 'center' | 'right' } })} />
        <TextField label="Unavailable text" value={widget.value?.unavailable_text ?? ''} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
        <ColorField label="Color" value={widget.value?.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
      </Section>
      <BoxEditor widget={widget} update={update} />
    </>
  )
}

function TitleEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  return (
    <Section title="Title">
      <p className="text-muted-foreground">The caption breaks the top border, which is what gives a panel its label.</p>
      <TextField label="Text" value={widget.title?.text ?? ''} onChange={(value) => update((next) => { next.title = { ...next.title, text: value } })} />
      {widget.title?.text ? <><FontEditor font={widget.title.font} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} /><ColorField label="Color" value={widget.title.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} /><NumberField label="Y offset" value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} /></> : null}
    </Section>
  )
}

function BoxEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  return (
    <Section title="Box">
      <OptionalColorField label="Background" value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
      <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'right', 'bottom'] as const).map((key) => <NumberField key={key} label={`Padding ${key}`} value={widget.padding?.[key] ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, [key]: value } })} />)}</div>
      <div className="grid grid-cols-2 gap-2"><NumberField label="Border width" value={widget.border?.width_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} /><NumberField label="Radius" value={widget.border?.radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} /></div>
      <NumberField label="Background inset" value={widget.background_inset_px ?? 0} min={0} onChange={(value) => update((next) => {
        const inset = Math.max(0, Math.round(value))
        if (inset === 0) delete next.background_inset_px
        else next.background_inset_px = inset
      })} />
      <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      {/* A gradient is the far end of the background plus an axis; without a
          background there is nothing for it to run across, so it only appears
          once one is set. On the ESP32-P4 a gradient fill falls back to the
          software renderer — a performance note, not a correctness one. */}
      {widget.background_color ? (
        <>
          <OptionalColorField
            label="Background gradient to"
            value={widget.background_grad_color}
            onChange={(value) =>
              update((next) => {
                if (value) next.background_grad_color = value
                else {
                  delete next.background_grad_color
                  delete next.background_grad_dir
                }
              })
            }
          />
          {widget.background_grad_color ? (
            <SelectField
              label="Gradient axis"
              value={widget.background_grad_dir ?? 'vertical'}
              options={GRADIENT_DIRECTION_VALUES}
              onChange={(value) =>
                update((next) => {
                  next.background_grad_dir = value as GradientDirection
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

function ConditionsEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  const watched = widget.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  // A boolean field has nothing to be above or below, so the editor offers the
  // two states it can actually take.
  const boolean = field?.type === 'boolean'
  const operators = boolean ? BOOLEAN_OPERATORS : CONDITION_OPERATOR_VALUES
  const rules = widget.conditions ?? []
  const changeRule = (index: number, mutation: (rule: WidgetCondition) => void): void => update((next) => {
    const list = next.conditions ?? []
    if (list[index]) mutation(list[index])
  })
  return (
    <Section title="Conditions">
      <p className="text-muted-foreground">
        The watched field is independent of what the widget shows, so a gear readout can
        turn red on engine speed. A colour ramp moves the colour smoothly with the value;
        the first rule that holds paints over it, and anything a rule leaves unset stays
        as authored. Switch the preview to live values to watch both.
      </p>
      <TelemetryBindingField value={watched} onChange={(value) => update((next) => {
        if (!value) {
          delete next.condition_source
          delete next.conditions
          return
        }
        next.condition_source = { ...next.condition_source, binding: value }
        // Thresholds follow the data: switching to a boolean field leaves no
        // meaning in "above 0.9", so the rules move to the states it has.
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        if (selected?.type !== 'boolean') return
        for (const rule of next.conditions ?? []) {
          if (!BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above')) rule.op = 'equal'
          rule.value = (rule.value ?? 0) >= 1 ? 1 : 0
        }
      })} />
      {watched ? (
        <>
          <ColorRampEditor widget={widget} update={update} unit={field?.unit && field.unit !== 'source' ? field.unit : undefined} />
          {rules.map((rule, index) => (
            <div key={index} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Rule {index + 1}</span>
                <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={() => update((next) => {
                  next.conditions = (next.conditions ?? []).filter((_, position) => position !== index)
                  if (next.conditions.length === 0) delete next.conditions
                })}>
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="When value is" value={rule.op ?? 'at_or_above'} options={operators} onChange={(value) => changeRule(index, (next) => { next.op = value as ConditionOperator })} />
                {boolean ? (
                  <SelectField label="State" value={(rule.value ?? 0) >= 1 ? 'true' : 'false'} options={['true', 'false']} onChange={(value) => changeRule(index, (next) => { next.value = value === 'true' ? 1 : 0 })} />
                ) : (
                  <NumberField label={field?.unit && field.unit !== 'source' ? `Threshold (${field.unit})` : 'Threshold'} value={rule.value ?? 0} step="any" onChange={(value) => changeRule(index, (next) => { next.value = value })} />
                )}
              </div>
              <OptionalColorField label="Value color" value={rule.color} onChange={(value) => changeRule(index, (next) => { if (value) next.color = value; else delete next.color })} />
              <OptionalColorField label="Background" value={rule.background_color} onChange={(value) => changeRule(index, (next) => { if (value) next.background_color = value; else delete next.background_color })} />
              <OptionalColorField label="Border color" value={rule.border_color} onChange={(value) => changeRule(index, (next) => { if (value) next.border_color = value; else delete next.border_color })} />
              <CheckboxField label="Hide the widget" checked={rule.hidden ?? false} onChange={(checked) => changeRule(index, (next) => { if (checked) next.hidden = true; else delete next.hidden })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Blink period (ms, 0 = steady)" value={rule.blink_ms ?? 0} min={0} max={MAXIMUM_BLINK_MS} onChange={(value) => changeRule(index, (next) => {
                  const period = Math.round(value)
                  if (period <= 0) delete next.blink_ms
                  else next.blink_ms = Math.min(MAXIMUM_BLINK_MS, Math.max(MINIMUM_BLINK_MS, period))
                })} />
                <NumberField label="Hold after (ms, 0 = while true)" value={rule.hold_ms ?? 0} min={0} max={MAXIMUM_HOLD_MS} onChange={(value) => changeRule(index, (next) => {
                  const hold = Math.round(value)
                  if (hold <= 0) delete next.hold_ms
                  else next.hold_ms = Math.min(MAXIMUM_HOLD_MS, hold)
                })} />
              </div>
            </div>
          ))}
          {rules.length < MAXIMUM_WIDGET_CONDITIONS ? (
            <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => update((next) => {
              next.conditions = [...(next.conditions ?? []), { op: 'at_or_above', value: 0 }]
            })}>
              Add rule
            </button>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

// The ramp is the layer under the rules, so it is edited with them rather than
// in a section of its own.
function ColorRampEditor({ widget, update, unit }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
  unit?: string
}): React.JSX.Element {
  const stops = widget.color_ramp?.stops ?? []
  const changeStops = (mutation: (list: ColorStop[]) => ColorStop[]): void => update((next) => {
    const list = mutation([...(next.color_ramp?.stops ?? [])])
    if (list.length === 0) {
      delete next.color_ramp
      return
    }
    next.color_ramp = { ...next.color_ramp, stops: list }
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">Colour ramp</span>
        {stops.length > 0 ? (
          <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={() => update((next) => { delete next.color_ramp })}>
            Remove
          </button>
        ) : null}
      </div>
      {stops.length > 0 ? (
        <>
          <SelectField label="Paints" value={widget.color_ramp?.target ?? 'content'} options={COLOR_RAMP_TARGET_VALUES} onChange={(value) => update((next) => {
            next.color_ramp = { ...next.color_ramp, target: value as ColorRampTarget }
          })} />
          {stops.map((stop, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <NumberField label={unit ? `At (${unit})` : 'At'} value={stop.at ?? 0} step="any" onChange={(value) => changeStops((list) => {
                list[index] = { ...list[index], at: value }
                return list
              })} />
              <ColorField label="Color" value={stop.color ?? '#E8E8E8'} onChange={(value) => changeStops((list) => {
                list[index] = { ...list[index], color: value }
                return list
              })} />
              <button type="button" className="h-8 rounded-md border px-2 text-foreground" onClick={() => changeStops((list) => list.filter((_, position) => position !== index))}>
                Remove
              </button>
            </div>
          ))}
          {stops.length < MAXIMUM_COLOR_STOPS ? (
            <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => changeStops((list) => {
              const previous = list[list.length - 1]
              return [...list, { at: (previous?.at ?? 0) + 1, color: previous?.color ?? '#E8E8E8' }]
            })}>
              Add stop
            </button>
          ) : null}
          {stops.length < 2 ? <Hint>A ramp needs at least two stops to interpolate between.</Hint> : null}
        </>
      ) : (
        <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => changeStops(() => [
          { at: 0, color: '#00C853' },
          { at: 1, color: '#D50000' }
        ])}>
          Add a colour ramp
        </button>
      )}
    </div>
  )
}

function SourceEditor({ source, index, removable, onChange, onRemove }: {
  source: TextSourceConfiguration
  index: number
  removable: boolean
  onChange: (mutation: (next: TextSourceConfiguration) => void) => void
  onRemove: () => void
}): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === source.binding)
  const transforms = transformOptions(binding)
  const presets = unitPresetsFor(binding)
  const affix = (key: 'prefix' | 'suffix') => (value: string): void => onChange((next) => {
    const transform = next.transform ?? {}
    transform[key] = value
    next.transform = transform
    pruneTransform(next)
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">Source {index + 1}</span>
        {removable ? (
          <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      <TelemetryBindingField value={source.binding ?? ''} onChange={(value) => onChange((next) => {
        next.binding = value
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        // An unrecognized name is left alone: the binding is mid-edit, not wrong.
        if (selected && next.transform && !transformOptions(selected).includes(transformSelection(next.transform))) {
          clearTransformType(next.transform)
          pruneTransform(next)
        }
      })} />
      <SelectField label="Modifier" value={source.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => onChange((next) => {
        if (value === 'lap_timer') { next.binding = 'session.lap.current_time'; next.modifiers = [{ type: 'lap_timer' }] }
        else delete next.modifiers
      })} />
      <SelectField label="Transform" value={transformSelection(source.transform)} options={transforms} onChange={(value) => onChange((next) => {
        const transform = next.transform ?? {}
        clearTransformType(transform)
        if (value === 'number') transform.type = 'number'
        else if (value !== 'source_text') { transform.type = 'time'; transform.format = value as 'duration_ms' | 'signed_duration_ms' }
        next.transform = transform
        pruneTransform(next)
      })} />
      {source.transform?.type === 'number' ? (
        <>
          {presets.length > 0 ? <SelectField label="Unit preset" value={presets.find(({ scale, offset }) => scale === source.transform?.scale && offset === (source.transform?.offset ?? 0))?.label ?? ''} options={presets.map(({ label }) => label)} onChange={(label) => onChange((next) => {
            const preset = presets.find((entry) => entry.label === label)
            if (!preset || !next.transform) return
            next.transform.scale = preset.scale
            next.transform.offset = preset.offset
            next.transform.suffix = preset.suffix
          })} /> : null}
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Decimals" value={source.transform.decimals ?? 0} min={0} max={MAXIMUM_TRANSFORM_DECIMALS} onChange={(value) => onChange((next) => { if (next.transform) next.transform.decimals = Math.min(MAXIMUM_TRANSFORM_DECIMALS, Math.max(0, Math.round(value))) })} />
            <NumberField label="Scale" value={source.transform.scale ?? 1} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.scale = value })} />
            <NumberField label="Offset" value={source.transform.offset ?? 0} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.offset = value })} />
          </div>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2"><TextField label="Prefix" value={source.transform?.prefix ?? ''} onChange={affix('prefix')} /><TextField label="Suffix" value={source.transform?.suffix ?? ''} onChange={affix('suffix')} /></div>
    </div>
  )
}

function TelemetryBindingField({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  const listId = useId()
  const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
  return (
    <label className="block space-y-1 text-muted-foreground">
      <span>Binding</span>
      <input
        type="search"
        list={listId}
        className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
        placeholder="Search telemetry fields"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {TELEMETRY_CATALOG.map((entry) => (
          <option key={entry.name} value={entry.name} label={`${entry.categoryLabel} — ${entry.description}`} />
        ))}
      </datalist>
      {selected ? (
        <span className="block text-[11px] leading-4">
          {selected.categoryLabel} · {selected.type} · {selected.unit} · {selected.rate} · ID {selected.wireId}
        </span>
      ) : value ? (
        <span className="block text-[11px] leading-4 text-amber-400">Unknown telemetry binding</span>
      ) : null}
    </label>
  )
}

// The device rejects a transform it cannot read, so the editor offers only the
// ones the selected binding supports: any non-boolean value can be formatted as
// a number, while each duration format accepts one millisecond type.
function transformOptions(binding: TelemetryCatalogEntry | undefined): readonly string[] {
  if (!binding) return ['source_text']
  const options = ['source_text']
  if (binding.type !== 'boolean') options.push('number')
  if (binding.unit === 'millisecond' && binding.type === 'uint32') options.push('duration_ms')
  if (binding.unit === 'millisecond' && binding.type === 'int32') options.push('signed_duration_ms')
  return options
}

/** The Transform select value: a transform may exist carrying affixes alone. */
function transformSelection(transform: ValueTransform | undefined): string {
  if (transform?.type === 'number') return 'number'
  if (transform?.type === 'time') return transform.format ?? 'duration_ms'
  return 'source_text'
}

function clearTransformType(transform: ValueTransform): void {
  transform.type = 'none'
  delete transform.format
  delete transform.decimals
  delete transform.scale
  delete transform.offset
}

/** Keeps the document sparse: a transform that formats nothing is not written. */
function pruneTransform(source: TextSourceConfiguration): void {
  const transform = source.transform
  if (transform && (transform.type ?? 'none') === 'none' && !transform.prefix && !transform.suffix) {
    delete source.transform
  }
}

function FontEditor({ font, onChange }: { font?: FontSpec; onChange: (font: FontSpec) => void }): React.JSX.Element { return <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><TextField label="Font family" value={font?.family ?? ''} onChange={(family) => onChange({ ...font, family })} /><NumberField label="Size" value={font?.size_px ?? 16} min={1} max={255} onChange={(size_px) => onChange({ ...font, size_px })} /></div> }
/**
 * An identifier the device stores and never draws. A rename that would collide
 * or overflow is refused rather than silently adjusted, and the field reverts so
 * the refusal is visible instead of the edit vanishing.
 */
function IdField({
  label,
  value,
  onCommit
}: {
  label: string
  value: string
  onCommit: (name: string) => boolean
}): React.JSX.Element {
  // Keyed on the committed value by its callers, so a rename elsewhere remounts
  // this instead of being synced into it.
  const [draft, setDraft] = useState(value)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    if (draft === value) return
    if (!onCommit(draft)) {
      setRejected(true)
      setDraft(value)
    }
  }
  return (
    <label className="block space-y-1 text-muted-foreground">
      <span>{label}</span>
      <input
        value={draft}
        maxLength={WIDGET_ID_CAPACITY - 1}
        className={`h-8 w-full rounded-md border bg-background px-2 text-foreground ${rejected ? 'border-red-500' : ''}`}
        onChange={(event) => {
          setDraft(event.target.value)
          setRejected(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-2 border-t pt-3"><h3 className="font-medium">{title}</h3>{children}</section> }
function Hint({ children }: { children: React.ReactNode }): React.JSX.Element { return <p className="rounded-md border p-2 text-muted-foreground">{children}</p> }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></label>
}
function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number | 'any'; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input type="number" className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) change(next) }} onBlur={flush} /></label>
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><select className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{value === '' ? <option value="">Not set</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, (next) => onChange(next as RgbColor))
  const opaque = /^#[0-9A-Fa-f]{6}$/.test(local)
  return <label className="flex items-end gap-2 text-muted-foreground"><span className="min-w-0 flex-1 space-y-1"><span className="block">{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></span><input aria-label={`${label} picker`} type="color" className="h-8 w-10 rounded border bg-background p-1" value={opaque ? local : '#000000'} onChange={(event) => onChange(event.target.value as RgbColor)} /></label>
}
function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element { return <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }
function selectionValue(selection: WidgetSelection | undefined): string { return selection?.type === 'screen' ? 'screen' : selection?.type === 'widget' ? `widget:${selection.id}` : '' }
function parseSelection(value: string): WidgetSelection | undefined { if (value === 'screen') return { type: 'screen' }; if (value.startsWith('widget:')) return { type: 'widget', id: value.slice(7) }; return undefined }

function OptionalColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: RgbColor | undefined) => void }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <CheckboxField label={`${label} enabled`} checked={value !== undefined} onChange={(checked) => onChange(checked ? '#000000' : undefined)} />
      {value !== undefined ? <ColorField label={label} value={value} onChange={onChange} /> : null}
    </div>
  )
}

/**
 * Keeps typing local and commits on a trailing delay or on blur. Without this
 * every keystroke rewrote the whole configuration document.
 */
function useDebouncedCommit<T>(value: T, commit: (value: T) => void, delay = 200): [T, (next: T) => void, () => void] {
  const [local, setLocal] = useState(value)
  const editing = useRef(false)
  const latest = useRef(commit)

  useEffect(() => {
    latest.current = commit
  })

  useEffect(() => {
    if (!editing.current) setLocal(value)
  }, [value])

  useEffect(() => {
    if (!editing.current) return
    const timer = setTimeout(() => {
      editing.current = false
      latest.current(local)
    }, delay)
    return () => clearTimeout(timer)
  }, [local, delay])

  const change = (next: T): void => {
    editing.current = true
    setLocal(next)
  }
  const flush = (): void => {
    if (!editing.current) return
    editing.current = false
    latest.current(local)
  }
  return [local, change, flush]
}
