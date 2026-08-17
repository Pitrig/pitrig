import { screensOf } from '../../../../../shared/configuration-access'
import { CONDITION_OPERATOR_VALUES, type ConditionOperator, MAXIMUM_ACTIONS, MAXIMUM_SLOTS, MAXIMUM_WIDGET_CONDITIONS, type ValueSourceConfiguration, WIDGET_ACTION_TYPE_VALUES, type WidgetAction, type WidgetActionType, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { TELEMETRY_CATALOG } from '../../../../../shared/telemetry-catalog'
import { MAXIMUM_HOLD_MS } from '../../../../../shared/widget-conditions'
import { type WidgetSelection, actionCount, groupById, mutateActiveScreen, mutateGroup, mutateSelectedWidget, renameGroup, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
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
 * The group the selected widget belongs to. A group is reached through its
 * widgets rather than through a selection type of its own: what the author
 * clicks on is always a widget, and the group is the parent behind it.
 *
 * Nothing shows for a widget on the screen itself, which is what "not in a
 * group" looks like.
 */
export function GroupEditor({
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
