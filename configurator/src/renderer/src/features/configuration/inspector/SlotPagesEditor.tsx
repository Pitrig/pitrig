import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CONDITION_OPERATOR_VALUES, type ConditionOperator, MAXIMUM_SLOT_PAGES, MAXIMUM_WIDGET_CONDITIONS, SLOT_TRIGGER_VALUES, type SlotPageConfiguration, type SlotTrigger } from '@shared/configuration-schema'
import { MAXIMUM_HOLD_MS } from '@shared/widget-conditions'
import { addSlotPage, deleteSlotPage, mutateSlotPage, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, NumberField, NumberInput, SelectField, SelectInput } from './fields'

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
    <Group
      id="Pages"
      title="Pages"
      icon={GROUP_ICONS.pages}
      hint={HINTS.slot.pages}
      summary={`${pages.length} page(s)`}
    >
      <div className="flex flex-wrap items-center gap-1">
        {pages.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-current={index === current}
            className={`size-7 rounded-md border ${index === current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => setSlotPage(slotId, index)}
          >
            {index + 1}
          </button>
        ))}
        {pages.length < MAXIMUM_SLOT_PAGES ? (
          <button
            type="button"
            aria-label="Add page"
            title="Add page"
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => addSlotPage(slotId)}
          >
            <Plus aria-hidden className="size-3" />
          </button>
        ) : null}
        {pages.length > 1 ? (
          <button
            type="button"
            aria-label={`Delete page ${current + 1}`}
            title={`Delete page ${current + 1}`}
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => deleteSlotPage(slotId, current)}
          >
            <Trash2 aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="flex h-7 w-full items-center justify-center gap-1 rounded-md border hover:bg-muted"
        onClick={() => setDrillIn(drillIn === slotId ? undefined : slotId)}
      >
        <Pencil aria-hidden className="size-3" />
        {drillIn === slotId ? 'Close this slot' : 'Edit pages on the canvas'}
      </button>
      {page ? (
        <>
          <CheckboxField
            label="In loop"
            hint={HINTS.slot.loop}
            checked={page.in_loop !== false}
            modified={authored(page.in_loop, true)}
            onReset={() => change((next) => { delete next.in_loop })}
            onChange={(checked) =>
              change((next) => {
                if (checked) delete next.in_loop
                else next.in_loop = false
              })
            }
          />
          <SelectField
            label="Trigger"
            hint={HINTS.slot.trigger}
            value={trigger}
            options={SLOT_TRIGGER_VALUES}
            modified={page.trigger !== undefined}
            onReset={() =>
              change((next) => {
                delete next.trigger
                delete next.source
                delete next.conditions
                delete next.duration_ms
              })
            }
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
          {trigger === 'none' ? null : (
            <>
              <TelemetryBindingField
                label="Watch"
                value={page.source?.binding ?? ''}
                onReset={() => change((next) => { delete next.source })}
                onChange={(binding) =>
                  change((next) => {
                    if (!binding) delete next.source
                    else next.source = { ...next.source, binding }
                  })
                }
              />
              <NumberField
                label="Duration"
                hint={HINTS.slot.duration}
                suffix="ms"
                value={page.duration_ms ?? 0}
                min={0}
                max={MAXIMUM_HOLD_MS}
                modified={authored(page.duration_ms, 0)}
                onReset={() => change((next) => { delete next.duration_ms })}
                onChange={(duration_ms) =>
                  change((next) => {
                    if (duration_ms <= 0) delete next.duration_ms
                    else next.duration_ms = Math.min(MAXIMUM_HOLD_MS, duration_ms)
                  })
                }
              />
              {trigger === 'conditions' ? (
                <>
                  {(page.conditions ?? []).map((rule, index) => (
                    <PropertyRow
                      key={index}
                      label={`Rule ${index + 1}`}
                      modified={authored(rule.op, 'at_or_above') || authored(rule.value, 0)}
                      onReset={() =>
                        change((next) => {
                          const rules = next.conditions ?? []
                          const reset = { ...rules[index] }
                          delete reset.op
                          delete reset.value
                          rules[index] = reset
                          next.conditions = rules
                        })
                      }
                    >
                      <div className="flex items-center gap-1">
                        <SelectInput
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
                        <NumberInput
                          title="Threshold"
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
                          aria-label={`Remove rule ${index + 1}`}
                          title="Remove this rule"
                          className="flex-none rounded-md border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          disabled={(page.conditions ?? []).length <= 1}
                          onClick={() =>
                            change((next) => {
                              const rules = (next.conditions ?? []).filter((_, at) => at !== index)
                              if (rules.length > 0) next.conditions = rules
                            })
                          }
                        >
                          <Trash2 aria-hidden className="size-3" />
                        </button>
                      </div>
                    </PropertyRow>
                  ))}
                  {(page.conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
                    <button
                      type="button"
                      className="flex h-7 w-full items-center justify-center gap-1 rounded-md border hover:bg-muted"
                      onClick={() =>
                        change((next) => {
                          next.conditions = [
                            ...(next.conditions ?? []),
                            { op: 'at_or_above', value: 1 }
                          ]
                        })
                      }
                    >
                      <Plus aria-hidden className="size-3" />
                      Add activation rule
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Group>
  )
}
