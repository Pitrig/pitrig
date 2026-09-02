import { screensOf } from '@shared/configuration-access'
import { SCREEN_TRANSITION_VALUES } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { documentFonts } from '@shared/document-fonts'
import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { applyFontFamilyToDashboard, draftFontFamily, mutateActiveScreen, mutateDraftConfiguration, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
import { authored } from './authored'
import { Group } from './Group'
import { t } from '@shared/ui-text'
import { InfoHint } from './InfoHint'
import { GROUP_ICONS } from './icons'
import { ColorField, FontFamilyField, IdField, SelectField } from './fields'
import { Button } from '@/components/ui/button'
import { dashboardFontFootprint, findFontEntry, kilobytes, useFontLibraryStore } from '@/features/font-library/font-library-store'

export function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const screen = screensOf(configuration)[activeScreenIndex]
  return (
    <Group id="Screen" title={`Screen ${activeScreenIndex + 1}`} icon={GROUP_ICONS.screen}>
      <IdField
        key={screen?.id ?? activeScreenIndex}
        label={t('device.infoPage.name')}
        hint={t('inspector.hints.screen.name')}
        value={screen?.id ?? `screen${activeScreenIndex + 1}`}
        onCommit={(name) => renameScreen(activeScreenIndex, name)}
      />
      <ColorField
        label={t('modules.effectColors.background')}
        hint={t('inspector.hints.screen.background')}
        value={screen?.background_color ?? '#000000'}
        modified={authored(screen?.background_color, '#000000')}
        onReset={() => mutateActiveScreen((screen) => { delete screen.background_color })}
        onChange={(background_color) =>
          mutateActiveScreen((screen) => {
            screen.background_color = background_color
          })
        }
      />
    </Group>
  )
}

export function DashboardSection({
  configuration
}: {
  configuration: DeviceConfiguration
}): React.JSX.Element {
  const entries = useFontLibraryStore((state) => state.entries)
  const defaultFontFamily = useDashboardEditorStore((state) => state.defaultFontFamily)
  const setDefaultFontFamily = useDashboardEditorStore((state) => state.setDefaultFontFamily)
  const family = draftFontFamily(configuration, defaultFontFamily)
  const used = [
    ...new Set(
      documentFonts(configuration)
        .map((font) => font?.family)
        .filter((value): value is string => Boolean(value))
    )
  ].sort()
  const footprint = dashboardFontFootprint(entries, used)
  return (
    <Group id="Dashboard" title={t('documents.label.dashboard')} icon={GROUP_ICONS.dashboard}>
      <SelectField
        label={t('inspector.documentSections.transition')}
        hint={t('inspector.hints.dashboard.transition')}
        value={configuration.dashboard?.transition ?? 'slide'}
        options={SCREEN_TRANSITION_VALUES}
        modified={authored(configuration.dashboard?.transition, 'slide')}
        onReset={() => mutateDraftConfiguration((draft) => { if (draft.dashboard) delete draft.dashboard.transition })}
        onChange={(transition) => mutateDraftConfiguration((draft) => {
          if (transition === 'slide') { if (draft.dashboard) delete draft.dashboard.transition }
          else draft.dashboard = { ...draft.dashboard, transition }
        })}
      />
      <FontFamilyField label={t('inspector.documentSections.newWidgets')} family={family} onChange={setDefaultFontFamily} hint={t('inspector.hints.dashboard.font')} />
      <Button
        variant="outline"
        className="w-full"
        disabled={used.length === 0}
        onClick={() => applyFontFamilyToDashboard(family)}
      >
        {t('inspector.documentSections.applyToEveryWidget')}</Button>
      <div className="space-y-1 rounded-md border p-2 text-muted-foreground">
        <p className="flex items-center gap-1">
          <span>
            {t('fonts.footprint', { families: footprint.families, maximum: MAXIMUM_FONT_FAMILIES, kilobytes: kilobytes(footprint.bytes) })}
          </span>
          <InfoHint text={t('inspector.hints.dashboard.budget')} label={t('inspector.documentSections.fontBudget')} />
        </p>
        <ul className="space-y-0.5">
          {used.map((id) => {
            const entry = findFontEntry(entries, id)
            return (
              <li key={id} className={entry ? '' : 'text-amber-500'}>
                {entry ? entry.name : t('inspector.documentSections.idNotInTheLibrary', { id: id })}
              </li>
            )
          })}
        </ul>
      </div>
    </Group>
  )
}
