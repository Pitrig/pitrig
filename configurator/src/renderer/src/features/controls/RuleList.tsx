import { MAXIMUM_CONTROL_RULES, type ConditionOperator } from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import { operatorsFor } from '@shared/widget-conditions'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import { CONTROL, NumberInput, SelectInput } from '@/features/configuration/inspector/fields'
import { TelemetryBindingField } from '@/features/configuration/inspector/TelemetryBindingField'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { addRule, changeRule, controlsOf, removeRule, screenIdsOf } from './controls-document'

export function RuleList(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const rules = arrayOf(controlsOf(draft).rules)
  const screens = screenIdsOf(draft)
  return (
    <div className="space-y-1.5">
      {rules.length === 0 ? (
        <p className="text-muted-foreground">{t('controls.ruleList.noRulesYet')}</p>
      ) : null}
      {rules.map((rule, index) => {
        const binding = rule.source?.binding ?? ''
        const condition = rule.conditions?.[0] ?? {}
        const operators = operatorsFor(binding)
        return (
          <div key={index} className="space-y-1 rounded-md border px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-none text-muted-foreground">{t('controls.ruleList.show')}</span>
              <Select
                className={cn(CONTROL, 'w-36')}
                aria-label={t('controls.ruleList.screen')}
                value={rule.screen ?? ''}
                options={screens.map((screen) => ({ value: screen, label: screen }))}
                onChange={(screen) => changeRule(index, (next) => { next.screen = screen })}
              />
              <span className="flex-none text-muted-foreground">{t('controls.ruleList.while')}</span>
              <div className="w-32 flex-none">
                <SelectInput
                  value={condition.op ?? 'at_or_above'}
                  options={operators}
                  onChange={(op) =>
                    changeRule(index, (next) => {
                      const conditions = [...(next.conditions ?? [{}])]
                      conditions[0] = { ...conditions[0], op: op as ConditionOperator }
                      next.conditions = conditions
                    })
                  }
                />
              </div>
              <div className="w-20 flex-none">
                <NumberInput
                  title={t('controls.ruleList.value')}
                  value={condition.value ?? 0}
                  step="any"
                  onChange={(value) =>
                    changeRule(index, (next) => {
                      const conditions = [...(next.conditions ?? [{}])]
                      conditions[0] = { ...conditions[0], value }
                      next.conditions = conditions
                    })
                  }
                />
              </div>
              <span className="flex-1" />
              <RemoveButton
                label={t('controls.ruleList.removeRuleNumber', { number: index + 1 })}
                onClick={() => removeRule(index)}
              />
            </div>
            <TelemetryBindingField
              label={t('controls.ruleList.watch')}
              hint={t('controls.hints.ruleSource')}
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
            {(rule.conditions?.length ?? 0) > 1 ? (
              <p className="text-muted-foreground">
                {t('controls.ruleList.moreConditions', { count: (rule.conditions?.length ?? 1) - 1 })}
              </p>
            ) : null}
          </div>
        )
      })}
      {rules.length < MAXIMUM_CONTROL_RULES && screens.length > 0 ? (
        <AddButton label={t('controls.ruleList.addRule')} onClick={() => addRule(draft)} />
      ) : null}
    </div>
  )
}
