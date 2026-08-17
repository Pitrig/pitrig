import { screensOf, widgetsOf } from '../../../../../shared/configuration-access'
import { CONDITION_OPERATOR_VALUES, type ConditionOperator, MAXIMUM_ACTIONS, MAXIMUM_SLOTS, MAXIMUM_WIDGET_CONDITIONS, type ShapeWidgetConfiguration, type ValueSourceConfiguration, WIDGET_ACTION_TYPE_VALUES, type WidgetAction, type WidgetActionType, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { TELEMETRY_CATALOG } from '../../../../../shared/telemetry-catalog'
import { MAXIMUM_HOLD_MS } from '../../../../../shared/widget-conditions'
import { type WidgetSelection, actionCount, mutateActiveScreen, mutateSelectedWidget, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { CheckboxField, ColorField, IdField, NumberField, Section, SelectField } from './fields'

interface RangedWidget {
  source?: ValueSourceConfiguration
  minimum?: number
  maximum?: number
}

export function SourceRangeSection<T extends RangedWidget>({ widget, update }: { widget: T; update: (mutation: (next: T) => void) => void }): React.JSX.Element {
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


export function ActionEditor({
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
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
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
          {/* The canvas cannot be tapped the way the board is, so following the
              action here is how a link gets checked while authoring. */}
          {type !== 'none' ? (
            <button
              type="button"
              className="h-8 rounded-md border px-2 hover:bg-muted"
              onClick={() => {
                const index =
                  type === 'goto_screen'
                    ? screens.findIndex((screen) => screen.id === action?.screen)
                    : (activeScreenIndex + (type === 'next_screen' ? 1 : screens.length - 1)) %
                      Math.max(screens.length, 1)
                if (index >= 0) setActiveScreen(index)
              }}
            >
              Follow this action
            </button>
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
 * What a shape gains by holding widgets: the slot it takes part in, and the
 * rules that decide when it is the one shown. Its name, box, stacking and
 * action are ordinary widget properties and are edited where every widget's
 * are, which is most of what a group used to need its own panel for.
 */
export function ContainerEditor({
  widget,
  update
}: {
  widget: ShapeWidgetConfiguration
  update: (mutation: (next: ShapeWidgetConfiguration) => void) => void
}): React.JSX.Element {
  const slot = widget.slot ?? 0
  const children = widgetsOf(widget).length
  return (
    <Section title="Container">
      <p className="text-muted-foreground">
        {children === 0
          ? 'This shape holds no widgets. Select some and wrap them to make it a container; an empty one with an action is an invisible tap zone.'
          : `Holds ${children} widget(s), placed relative to this box. They are drawn even where they overhang it.`}
      </p>
      <NumberField
        label="Slot (0 = always visible)"
        value={slot}
        min={0}
        max={MAXIMUM_SLOTS}
        onChange={(value) =>
          update((target) => {
            if (value <= 0) {
              delete target.slot
              delete target.slot_default
              delete target.slot_source
              delete target.slot_conditions
              return
            }
            target.slot = value
          })
        }
      />
      {slot > 0 ? (
        <>
          <CheckboxField
            label="Shown first in this slot"
            checked={widget.slot_default === true}
            onChange={(checked) =>
              update((target) => {
                if (checked) target.slot_default = true
                else delete target.slot_default
              })
            }
          />
          <p className="text-muted-foreground">
            Shapes sharing a slot must share one parent and this box, and exactly one of them must
            be shown first. Tapping the slot on the board cycles to the next one; a matching rule
            below overrides that while it holds.
          </p>
          <TelemetryBindingField
            value={widget.slot_source?.binding ?? ''}
            onChange={(binding) =>
              update((target) => {
                if (!binding) delete target.slot_source
                else target.slot_source = { ...target.slot_source, binding }
              })
            }
          />
          {(widget.slot_conditions ?? []).map((rule, index) => (
            <div key={index} className="grid grid-cols-[6rem_1fr_5rem_auto] items-end gap-2">
              <SelectField
                label="When"
                value={rule.op ?? 'above'}
                options={CONDITION_OPERATOR_VALUES}
                onChange={(op) =>
                  update((target) => {
                    const rules = target.slot_conditions ?? []
                    rules[index] = { ...rules[index], op: op as ConditionOperator }
                    target.slot_conditions = rules
                  })
                }
              />
              <NumberField
                label="Value"
                value={rule.value ?? 0}
                step="any"
                onChange={(value) =>
                  update((target) => {
                    const rules = target.slot_conditions ?? []
                    rules[index] = { ...rules[index], value }
                    target.slot_conditions = rules
                  })
                }
              />
              <NumberField
                label="Hold ms"
                value={rule.hold_ms ?? 0}
                min={0}
                max={MAXIMUM_HOLD_MS}
                onChange={(hold_ms) =>
                  update((target) => {
                    const rules = target.slot_conditions ?? []
                    rules[index] = { ...rules[index], hold_ms }
                    target.slot_conditions = rules
                  })
                }
              />
              <button
                type="button"
                className="h-8 rounded-md border px-2 hover:bg-muted"
                onClick={() =>
                  update((target) => {
                    const rules = (target.slot_conditions ?? []).filter((_, at) => at !== index)
                    if (rules.length === 0) delete target.slot_conditions
                    else target.slot_conditions = rules
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {(widget.slot_conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
            <button
              type="button"
              className="h-8 rounded-md border px-2 hover:bg-muted"
              onClick={() =>
                update((target) => {
                  target.slot_conditions = [
                    ...(target.slot_conditions ?? []),
                    { op: 'above', value: 0 }
                  ]
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

export function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
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

export function GeometryEditor({ selection, placement, zIndex }: { selection: WidgetSelection; placement?: Required<WidgetPlacement>; zIndex: number }): React.JSX.Element {
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
