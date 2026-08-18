import { screensOf, widgetsOf } from '@shared/configuration-access'
import { CONDITION_OPERATOR_VALUES, type ConditionOperator, MAXIMUM_ACTIONS, MAXIMUM_SLOT_PAGES, MAXIMUM_WIDGET_CONDITIONS, type ShapeWidgetConfiguration, SLOT_TRIGGER_VALUES, type SlotPageConfiguration, type SlotTrigger, type ValueSourceConfiguration, WIDGET_ACTION_TYPE_VALUES, type WidgetAction, type WidgetActionType, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { MAXIMUM_HOLD_MS } from '@shared/widget-conditions'
import { type WidgetSelection, actionCount, addSlotPage, deleteSlotPage, mutateActiveScreen, mutateSelectedWidget, mutateSlotPage, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
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
 * What a shape gains by holding widgets. Its name, box, stacking and action are
 * ordinary widget properties and are edited where every widget's are, so all
 * that is left here is what containment itself means. Switching what an area
 * shows is the slot widget's business now, not the shape's.
 */
export function ContainerEditor({
  widget
}: {
  widget: ShapeWidgetConfiguration
}): React.JSX.Element {
  const children = widgetsOf(widget).length
  return (
    <Section title="Container">
      <p className="text-muted-foreground">
        {children === 0
          ? 'This shape holds no widgets. Select some and wrap them to make it a container; an empty one with an action is an invisible tap zone.'
          : `Holds ${children} widget(s), placed relative to this box. They are drawn even where they overhang it.`}
      </p>
    </Section>
  )
}

/**
 * The pages of a slot: which of them the tap cycles, and what telemetry raises
 * one over the others. The widgets on a page are authored in the canvas rather
 * than here — a page is an area of the screen, so it is edited by looking at it.
 */
export function SlotPagesEditor({
  slotId,
  pages
}: {
  slotId: string
  pages: SlotPageConfiguration[]
}): React.JSX.Element {
  const current = useDashboardEditorStore((state) => state.slotPage[slotId] ?? 0)
  const setSlotPage = useDashboardEditorStore((state) => state.setSlotPage)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
  const page = pages[current]
  const trigger = page?.trigger ?? 'none'
  const change = (mutation: (next: SlotPageConfiguration) => void): void =>
    mutateSlotPage(slotId, current, mutation)

  return (
    <Section title="Pages">
      <div className="flex flex-wrap items-center gap-1">
        {pages.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`h-8 rounded-md border px-2 ${index === current ? 'bg-muted' : 'hover:bg-muted'}`}
            onClick={() => setSlotPage(slotId, index)}
          >
            {index + 1}
          </button>
        ))}
        {pages.length < MAXIMUM_SLOT_PAGES ? (
          <button
            type="button"
            className="h-8 rounded-md border px-2 hover:bg-muted"
            onClick={() => addSlotPage(slotId)}
          >
            Add page
          </button>
        ) : null}
        {pages.length > 1 ? (
          <button
            type="button"
            className="h-8 rounded-md border px-2 hover:bg-muted"
            onClick={() => deleteSlotPage(slotId, current)}
          >
            Delete page
          </button>
        ) : null}
      </div>
      <p className="text-muted-foreground">
        Page order is priority: when two pages are triggered at once the device shows the earlier
        one.
      </p>
      <button
        type="button"
        className="h-8 rounded-md border px-2 hover:bg-muted"
        onClick={() => setDrillIn(drillIn === slotId ? undefined : slotId)}
      >
        {drillIn === slotId ? 'Close this slot' : 'Edit pages on the canvas'}
      </button>
      {page ? (
        <>
          <CheckboxField
            label="In the tap loop"
            checked={page.in_loop !== false}
            onChange={(checked) =>
              change((next) => {
                if (checked) delete next.in_loop
                else next.in_loop = false
              })
            }
          />
          <SelectField
            label="Shown by telemetry"
            value={trigger}
            options={SLOT_TRIGGER_VALUES}
            onChange={(value) =>
              change((next) => {
                const chosen = value as SlotTrigger
                if (chosen === 'none') {
                  // The device refuses a binding, a rule or a duration nothing
                  // reads, so dropping the trigger drops what it was reading.
                  delete next.trigger
                  delete next.source
                  delete next.conditions
                  delete next.duration_ms
                  return
                }
                next.trigger = chosen
                if (chosen === 'value_changed') delete next.conditions
                if (chosen === 'value_changed' && !next.duration_ms) next.duration_ms = 2000
                if (chosen === 'conditions' && !next.conditions?.length) {
                  next.conditions = [{ op: 'at_or_above', value: 1 }]
                }
              })
            }
          />
          {trigger === 'none' ? (
            <p className="text-muted-foreground">
              Reached only by tapping the slot. Give it a trigger to have the device raise it over
              the loop on its own.
            </p>
          ) : (
            <>
              <TelemetryBindingField
                value={page.source?.binding ?? ''}
                onChange={(binding) =>
                  change((next) => {
                    if (!binding) delete next.source
                    else next.source = { ...next.source, binding }
                  })
                }
              />
              <NumberField
                label="Shown for (ms)"
                value={page.duration_ms ?? 0}
                min={0}
                max={MAXIMUM_HOLD_MS}
                onChange={(duration_ms) =>
                  change((next) => {
                    if (duration_ms <= 0) delete next.duration_ms
                    else next.duration_ms = Math.min(MAXIMUM_HOLD_MS, duration_ms)
                  })
                }
              />
              <p className="text-muted-foreground">
                {trigger === 'value_changed'
                  ? 'Shown whenever the value differs from the last one seen — which is what makes a momentary aid such as ABS readable. It needs a time to stay up for.'
                  : 'Shown while a rule below holds. Zero shows it only while one holds; a time keeps it up for that long after the last match.'}
              </p>
              {trigger === 'conditions' ? (
                <>
                  {(page.conditions ?? []).map((rule, index) => (
                    <div key={index} className="grid grid-cols-[6rem_1fr_auto] items-end gap-2">
                      <SelectField
                        label="When"
                        value={rule.op ?? 'at_or_above'}
                        options={CONDITION_OPERATOR_VALUES}
                        onChange={(op) =>
                          change((next) => {
                            const rules = next.conditions ?? []
                            rules[index] = { ...rules[index], op: op as ConditionOperator }
                            next.conditions = rules
                          })
                        }
                      />
                      <NumberField
                        label="Value"
                        value={rule.value ?? 0}
                        step="any"
                        onChange={(value) =>
                          change((next) => {
                            const rules = next.conditions ?? []
                            rules[index] = { ...rules[index], value }
                            next.conditions = rules
                          })
                        }
                      />
                      <button
                        type="button"
                        className="h-8 rounded-md border px-2 hover:bg-muted"
                        disabled={(page.conditions ?? []).length <= 1}
                        onClick={() =>
                          change((next) => {
                            const rules = (next.conditions ?? []).filter((_, at) => at !== index)
                            if (rules.length > 0) next.conditions = rules
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {(page.conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
                    <button
                      type="button"
                      className="h-8 rounded-md border px-2 hover:bg-muted"
                      onClick={() =>
                        change((next) => {
                          next.conditions = [
                            ...(next.conditions ?? []),
                            { op: 'at_or_above', value: 1 }
                          ]
                        })
                      }
                    >
                      Add activation rule
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          )}
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
