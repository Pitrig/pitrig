import { MAXIMUM_IDLE_RETURN_MS } from '@shared/configuration-schema'
import { t } from '@shared/ui-text'
import { Select } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import { CONTROL, NumberField } from '@/features/configuration/inspector/fields'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { controlsOf, screenIdsOf, setHomeAfter, setHomeScreen } from './controls-document'

const SECOND_MS = 1000

export function HomeSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const controls = controlsOf(draft)
  const screens = screenIdsOf(draft)
  const seconds = (controls.home_after_ms ?? 0) / SECOND_MS
  return (
    <div className="grid max-w-md gap-1.5">
      <PropertyRow label={t('controls.homeSection.homeScreen')} hint={t('controls.hints.homeScreen')}>
        <Select
          className={CONTROL}
          value={controls.home_screen ?? ''}
          options={[
            { value: '', label: t('controls.homeSection.theFirstScreen') },
            ...screens.map((screen) => ({ value: screen, label: screen }))
          ]}
          onChange={setHomeScreen}
        />
      </PropertyRow>
      <NumberField
        label={t('controls.homeSection.returnAfter')}
        hint={t('controls.hints.homeAfter')}
        value={seconds}
        min={0}
        max={MAXIMUM_IDLE_RETURN_MS / SECOND_MS}
        step={1}
        suffix={t('controls.homeSection.seconds')}
        modified={seconds > 0}
        onReset={() => setHomeAfter(0)}
        onChange={(value) =>
          setHomeAfter(Math.round(Math.min(Math.max(value, 0), MAXIMUM_IDLE_RETURN_MS / SECOND_MS)) * SECOND_MS)
        }
      />
    </div>
  )
}
