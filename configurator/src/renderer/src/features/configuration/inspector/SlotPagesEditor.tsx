import { CONDITION_OPERATOR_VALUES, type ConditionOperator, MAXIMUM_SLOT_PAGES, MAXIMUM_WIDGET_CONDITIONS, SLOT_TRIGGER_VALUES, type SlotPageConfiguration, type SlotTrigger } from '@shared/configuration-schema'
import { MAXIMUM_HOLD_MS } from '@shared/widget-conditions'
import { addSlotPage, deleteSlotPage, mutateSlotPage, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { CheckboxField, NumberField, Section, SelectField } from './fields'

// A slot's pages: the tab strip, which page is being edited, what raises a page
// over the loop, and the rules behind that. The largest single editor, and the
// only one with a list inside a list.

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
