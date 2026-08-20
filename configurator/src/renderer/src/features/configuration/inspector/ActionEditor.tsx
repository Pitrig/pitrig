import { screensOf } from '@shared/configuration-access'
import { MAXIMUM_ACTIONS, WIDGET_ACTION_TYPE_VALUES, type WidgetAction, type WidgetActionType } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { actionCount, useDashboardEditorStore } from '../dashboard-editor'
import { Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { SelectField } from './fields'

// What a tap on this widget does. An action is bounded per document, so the
// editor has to say when there is no room for another one.

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
    <Group
      id="Action"
      title="Action"
      icon={GROUP_ICONS.action}
      hint={HINTS.action.tap}
      summary={type === 'goto_screen' ? `Go to ${action?.screen || '—'}` : type === 'none' ? 'None' : type}
      defaultOpen={type !== 'none'}
    >
      {disabledReason ? (
        <p className="text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <SelectField
            label="On tap"
            value={type}
            options={WIDGET_ACTION_TYPE_VALUES}
            modified={action !== undefined}
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
              // The other types name no screen, and one that does is rejected
              // by the device rather than ignored.
              onChange({ type: next as WidgetActionType })
            }}
          />
          {type === 'goto_screen' ? (
            <SelectField
              label="Screen"
              hint={HINTS.action.screen}
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
    </Group>
  )
}
