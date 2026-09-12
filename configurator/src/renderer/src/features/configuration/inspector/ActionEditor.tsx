import { screensOf } from '@shared/configuration-access'
import { MAXIMUM_ACTIONS, WIDGET_ACTION_TYPE_VALUES, type WidgetAction, type WidgetActionType } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { actionCount, useDashboardEditorStore } from '../dashboard-editor'
import { authored } from './authored'
import { Group } from './Group'
import { t } from '@shared/ui-text'
import { GROUP_ICONS } from './icons'
import { SelectField } from './fields'

const TAKES_A_TARGET: readonly string[] = WIDGET_ACTION_TYPE_VALUES.filter(
  (entry) => entry !== 'none'
)

export function ActionEditor({
  configuration,
  action,
  onChange
}: {
  configuration: DeviceConfiguration
  action?: WidgetAction
  onChange: (action: WidgetAction | undefined) => void
}): React.JSX.Element {
  const type = action?.type ?? 'none'
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
  const screens = screensOf(configuration)
  const atCapacity = actionCount(configuration) >= MAXIMUM_ACTIONS && type === 'none'
  return (
    <Group
      id="Action"
      title={t('inspector.actionEditor.action')}
      icon={GROUP_ICONS.action}
      hint={t('inspector.hints.action.tap')}
      summary={type === 'goto_screen' ? t('inspector.actionEditor.goToScreen', { screen: action?.screen || '—' }) : type === 'none' ? t('common.none') : type}
      defaultOpen={type !== 'none'}
    >
      <SelectField
        label={t('inspector.actionEditor.onTap')}
        value={type}
        options={WIDGET_ACTION_TYPE_VALUES}
        disabledOptions={atCapacity ? TAKES_A_TARGET : undefined}
        modified={authored(type, 'none')}
        onReset={() => onChange(undefined)}
        onChange={(next) => {
          if (next === 'none') {
            onChange(undefined)
            return
          }
          if (next === 'goto_screen') {
            onChange({ type: 'goto_screen', screen: screens[0]?.id ?? '' })
            return
          }
          onChange({ type: next as WidgetActionType })
        }}
      />
      {type === 'goto_screen' ? (
        <SelectField
          label={t('inspector.actionEditor.screen')}
          hint={t('inspector.hints.action.screen')}
          value={action?.screen ?? ''}
          options={screens.map((screen, index) => screen.id ?? `screen${index + 1}`)}
          onChange={(screen) => onChange({ type: 'goto_screen', screen })}
        />
      ) : null}
      {type !== 'none' ? (
        <button
          type="button"
          className="h-7 w-full rounded-md border px-2 hover:bg-muted"
          onClick={() => {
            const index =
              type === 'goto_screen'
                ? screens.findIndex((screen) => screen.id === action?.screen)
                : (activeScreenIndex + (type === 'next_screen' ? 1 : screens.length - 1)) %
                  Math.max(screens.length, 1)
            if (index >= 0) setActiveScreen(index)
          }}
        >
          {t('inspector.actionEditor.followThisAction')}</button>
      ) : null}
      {atCapacity ? (
        <p className="text-muted-foreground">
          {t('inspector.actionEditor.thisDashboardAlreadyUsesAll', { mAXIMUM_ACTIONS: MAXIMUM_ACTIONS })}
        </p>
      ) : null}
    </Group>
  )
}
