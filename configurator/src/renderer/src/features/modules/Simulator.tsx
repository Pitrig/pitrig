import { Pause, Play, RotateCcw } from 'lucide-react'

import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { useDeviceStore } from '@/features/device/device-store'
import { t } from '@shared/ui-text'
import { gearText, simulatedValue, type SimulatorControl } from './simulator-controls'
import { followsSimHub, useSimulatorStore, type TelemetryState } from './simulator-store'


const CHIP = 'rounded border px-2 py-1 text-[11px]'
const CHIP_ON = 'border-sky-500/50 bg-sky-500/20 text-sky-200'
const CHIP_OFF = 'hover:bg-white/5'

function shown(control: SimulatorControl, value: number): string {
  if (control.kind === 'gear') return gearText(control, value)
  const digits = control.step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(control.step)))
  const suffix = control.unit === 'percent' ? ' %' : ''
  return `${value.toFixed(digits)}${suffix}`
}

function Slider({
  control,
  value
}: {
  control: SimulatorControl
  value: number
}): React.JSX.Element {
  const sweeping = useSimulatorStore((state) => state.sweeping === control.binding)
  const setValue = useSimulatorStore((state) => state.setValue)
  const setSweeping = useSimulatorStore((state) => state.setSweeping)
  return (
    <div className="flex items-center gap-2" title={control.title}>
      <span className="w-40 flex-none truncate text-[11px]">{control.label}</span>
      <input
        type="range"
        aria-label={control.label}
        className="h-6 min-w-0 flex-1 accent-sky-400"
        min={control.minimum}
        max={control.maximum}
        step={control.step}
        value={value}
        onChange={(event) => setValue(control.binding, Number(event.target.value))}
      />
      <span className="w-14 flex-none text-right font-mono text-[11px] tabular-nums">
        {shown(control, value)}
      </span>
      {control.kind === 'slider' ? (
        <button
          type="button"
          aria-pressed={sweeping}
          aria-label={sweeping ? t('modules.simulator.stopSweeping') : t('modules.simulator.sweep')}
          title={t('modules.simulator.sweepsTheValueUpAnd')}
          className={`rounded p-1 ${sweeping ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
          onClick={() => setSweeping(sweeping ? null : control.binding)}
        >
          {sweeping ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
      ) : (
        <span className="w-[22px] flex-none" />
      )}
    </div>
  )
}

export function Simulator({
  device,
  controls,
  telemetry,
  nowMs
}: {
  device: HardwareDeviceConfiguration
  controls: readonly SimulatorControl[]
  telemetry: TelemetryState
  nowMs: number
}): React.JSX.Element {
  const values = useSimulatorStore((state) => state.values)
  const sweeping = useSimulatorStore((state) => state.sweeping)
  const idle = useSimulatorStore((state) => state.idle)
  const source = useSimulatorStore((state) => state.source)
  const setValue = useSimulatorStore((state) => state.setValue)
  const setIdle = useSimulatorStore((state) => state.setIdle)
  const setSource = useSimulatorStore((state) => state.setSource)
  const reset = useSimulatorStore((state) => state.reset)
  const onBoard = useSimulatorStore((state) => state.onBoard)
  const setOnBoard = useSimulatorStore((state) => state.setOnBoard)
  const connected = useDeviceStore((state) => state.status === 'connected' && state.session !== undefined)
  const live = telemetry !== 'none'
  const following = followsSimHub(source, telemetry)
  const toggles = controls.filter((control) => control.kind === 'toggle')
  const sliders = controls.filter((control) => control.kind !== 'toggle')
  const idleLayer = (device.effects ?? []).some((effect) => effect.gate === 'telemetry_idle')

  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{t('modules.simulator.drivenBy')}</span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!live}
            aria-pressed={following}
            title={telemetry === 'game' ? undefined : t('modules.simulator.startAGameOrA')}
            className={`${CHIP} ${following ? CHIP_ON : CHIP_OFF} disabled:opacity-40`}
            onClick={() => setSource('simhub')}
          >
            {t('modules.simulator.simHub')}
          </button>
          <button
            type="button"
            aria-pressed={!following}
            className={`${CHIP} ${!following ? CHIP_ON : CHIP_OFF}`}
            onClick={() => setSource('simulator')}
          >
            {t('modules.simulator.simulator')}
          </button>
        </div>
        <span className="min-w-0 flex-1 text-[10px] text-muted-foreground">
          {following
            ? telemetry === 'game'
              ? t('modules.simulator.theLampsFollowTheGame')
              : t('modules.simulator.simHubSendsNoValuesDark')
            : telemetry === 'game'
              ? t('modules.simulator.simHubIsSendingTelemetry')
              : telemetry === 'idle'
                ? t('modules.simulator.simHubSendsNoValues')
                : t('modules.simulator.noTelemetryFromSimHub')}
        </span>
        {!following ? (
          <button
            type="button"
            aria-pressed={onBoard && connected}
            disabled={!connected}
            title={connected
              ? t('modules.simulator.feedsTheseValuesToTheBoard')
              : t('modules.simulator.connectABoardToDrive')}
            className={`${CHIP} ${onBoard && connected ? CHIP_ON : CHIP_OFF} disabled:opacity-40`}
            onClick={() => setOnBoard(!onBoard)}
          >
            {t('modules.simulator.showOnTheBoard')}
          </button>
        ) : null}
        {!following ? (
          <button
            type="button"
            title={t('modules.simulator.resetEveryValue')}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-white/5"
            onClick={reset}
          >
            <RotateCcw className="size-3" /> {t('modules.simulator.reset')}
          </button>
        ) : null}
      </div>
      {!following && onBoard && connected ? (
        <p className="text-[10px] text-sky-200/80">{t('modules.simulator.theBoardFollowsTheseValues')}</p>
      ) : null}
      {following ? null : (
        <>
          {toggles.length > 0 || idleLayer ? (
            <div className="flex flex-wrap gap-1">
              {toggles.map((control) => {
                const on = simulatedValue(control, values, sweeping, nowMs) >= 1
                return (
                  <button
                    key={control.binding}
                    type="button"
                    aria-pressed={on}
                    title={control.title}
                    className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                    onClick={() => setValue(control.binding, on ? 0 : 1)}
                  >
                    {control.label}
                  </button>
                )
              })}
              {idleLayer ? (
                <button
                  type="button"
                  aria-pressed={idle}
                  title={t('modules.simulator.layersGatedOnTelemetryIdle')}
                  className={`${CHIP} ${idle ? CHIP_ON : CHIP_OFF}`}
                  onClick={() => setIdle(!idle)}
                >
                  {t('modules.simulator.telemetryLost')}
                </button>
              ) : null}
            </div>
          ) : null}
          {sliders.map((control) => (
            <Slider
              key={control.binding}
              control={control}
              value={simulatedValue(control, values, sweeping, nowMs)}
            />
          ))}
          {controls.length === 0 && !idleLayer ? (
            <p className="text-[10px] text-muted-foreground">{t('modules.simulator.noLayerReadsTelemetry')}</p>
          ) : null}
        </>
      )}
    </div>
  )
}
