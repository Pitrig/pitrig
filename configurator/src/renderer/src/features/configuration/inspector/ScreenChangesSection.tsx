import {
  MAXIMUM_CONTROL_RULES,
  MAXIMUM_IDLE_RETURN_MS,
  type ConditionOperator,
  type ControlRule,
  type ValueCondition
} from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import type { DeviceConfiguration } from '@shared/device'
import { operatorsFor } from '@shared/widget-conditions'
import { t } from '@shared/ui-text'
import { Select } from '@/components/ui/select'
import {
  addRule,
  changeRule,
  controlsOf,
  removeRule,
  screenIdsOf,
  setHomeAfter,
  setHomeScreen
} from '../dashboard-editor'
import { CONTROL, NumberField, NumberInput, SelectInput } from './fields'
import { Group } from './Group'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { TelemetryBindingField } from './TelemetryBindingField'
import { AddButton, RemoveButton } from './widget-editors'

const SECOND_MS = 1000

function setFirstCondition(index: number, patch: ValueCondition): void {
  changeRule(index, (next) => {
    const conditions = [...(next.conditions ?? [{}])]
    conditions[0] = { ...conditions[0], ...patch }
    next.conditions = conditions
  })
}

function RuleCard({
  rule,
  index,
  screens
}: {
  rule: ControlRule
  index: number
  screens: readonly string[]
}): React.JSX.Element {
  const binding = rule.source?.binding ?? ''
  const condition = rule.conditions?.[0] ?? {}
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="flex-none text-muted-foreground">{t('inspector.screenChanges.show')}</span>
        <Select
          className={CONTROL}
          aria-label={t('inspector.screenChanges.screen')}
          value={rule.screen ?? ''}
          options={screens.map((screen) => ({ value: screen, label: screen }))}
          onChange={(screen) => changeRule(index, (next) => { next.screen = screen })}
        />
        <RemoveButton
          label={t('inspector.screenChanges.removeRuleNumber', { number: index + 1 })}
          onClick={() => removeRule(index)}
        />
      </div>
      <TelemetryBindingField
        label={t('inspector.screenChanges.while')}
        hint={t('inspector.hints.screenChanges.watch')}
        value={binding}
        onChange={(value) =>
          changeRule(index, (next) => {
            next.source = { binding: value }
            if (!operatorsFor(value).includes(next.conditions?.[0]?.op ?? 'at_or_above')) {
              next.conditions = [{ op: operatorsFor(value)[0] ?? 'equal', value: 1 }]
            }
          })
        }
      />
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-1.5">
        <SelectInput
          value={condition.op ?? 'at_or_above'}
          options={operatorsFor(binding)}
          onChange={(op) => setFirstCondition(index, { op: op as ConditionOperator })}
        />
        <NumberInput
          title={t('inspector.screenChanges.value')}
          value={condition.value ?? 0}
          step="any"
          onChange={(value) => setFirstCondition(index, { value })}
        />
      </div>
      {(rule.conditions?.length ?? 0) > 1 ? (
        <p className="text-muted-foreground">
          {t('inspector.screenChanges.moreConditions', { count: (rule.conditions?.length ?? 1) - 1 })}
        </p>
      ) : null}
    </div>
  )
}

export function ScreenChangesSection({
  configuration
}: {
  configuration: DeviceConfiguration
}): React.JSX.Element | null {
  const controls = controlsOf(configuration)
  const rules = arrayOf(controls.rules)
  const screens = screenIdsOf(configuration)
  const seconds = (controls.home_after_ms ?? 0) / SECOND_MS
  const authored = rules.length > 0 || Boolean(controls.home_screen) || seconds > 0
  if (screens.length < 2 && !authored) return null
  return (
    <Group
      id="ScreenChanges"
      title={t('inspector.screenChanges.automaticScreenChanges')}
      icon={GROUP_ICONS.screenChanges}
      hint={t('inspector.hints.screenChanges.group')}
      summary={rules.length > 0 ? t('inspector.screenChanges.ruleCount', { count: rules.length }) : undefined}
    >
      {rules.map((rule, index) => (
        <RuleCard key={index} rule={rule} index={index} screens={screens} />
      ))}
      {rules.length < MAXIMUM_CONTROL_RULES && screens.length > 0 ? (
        <AddButton label={t('inspector.screenChanges.addRule')} onClick={() => addRule(configuration)} />
      ) : null}
      <PropertyRow label={t('inspector.screenChanges.homeScreen')} hint={t('inspector.hints.screenChanges.homeScreen')}>
        <Select
          className={CONTROL}
          value={controls.home_screen ?? ''}
          options={[
            { value: '', label: t('inspector.screenChanges.theFirstScreen') },
            ...screens.map((screen) => ({ value: screen, label: screen }))
          ]}
          onChange={setHomeScreen}
        />
      </PropertyRow>
      <NumberField
        label={t('inspector.screenChanges.returnHomeAfter')}
        hint={t('inspector.hints.screenChanges.homeAfter')}
        value={seconds}
        min={0}
        max={MAXIMUM_IDLE_RETURN_MS / SECOND_MS}
        step={1}
        suffix={t('inspector.screenChanges.seconds')}
        modified={seconds > 0}
        onReset={() => setHomeAfter(0)}
        onChange={(value) =>
          setHomeAfter(Math.round(Math.min(Math.max(value, 0), MAXIMUM_IDLE_RETURN_MS / SECOND_MS)) * SECOND_MS)
        }
      />
    </Group>
  )
}
