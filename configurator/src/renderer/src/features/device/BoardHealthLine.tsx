import type { DeviceHealth } from '@shared/device'
import { t } from '@shared/ui-text'
import { describeFailedPhase, describeLastBoot } from './device-health'

function Warning({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="rounded-[9px] border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 flex-none rounded-full bg-amber-400" />
        <b className="font-semibold">{title}</b>
      </div>
      <p className="mt-1">{text}</p>
    </div>
  )
}

function safeModeText(health: DeviceHealth): string {
  const count = health.bootFailures
  const phase = describeFailedPhase(health)
  const cause =
    count === 0
      ? t('device.boardHealth.startedInSafeMode')
      : phase
        ? t('device.boardHealth.crashedWhile', { count, phase })
        : t('device.boardHealth.crashed', { count })
  return `${cause} ${t('device.boardHealth.loadAnotherSetup')}`
}

export function BoardHealthLine({ health }: { health: DeviceHealth }): React.JSX.Element {
  if (health.safeMode) {
    return <Warning title={t('device.boardHealth.safeMode')} text={safeModeText(health)} />
  }
  if (describeFailedPhase(health)) {
    return (
      <Warning
        title={t('device.boardHealth.crashedTitle')}
        text={t('device.boardHealth.recovered', { lastBoot: describeLastBoot(health) })}
      />
    )
  }
  if (health.bootFailures > 0) {
    return (
      <Warning
        title={t('device.boardHealth.crashedTitle')}
        text={t('device.boardHealth.earlierCrashes', { count: health.bootFailures })}
      />
    )
  }
  return (
    <section className="rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 flex-none rounded-full bg-emerald-400" />
        <span>
          <b className="font-semibold">{t('device.boardHealth.boardHealth')}</b>{' '}
          {t('device.boardHealth.startedNormally')}
        </span>
      </div>
    </section>
  )
}
