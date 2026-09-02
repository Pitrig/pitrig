import { useState } from 'react'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { useDeviceStore } from '@/features/device/device-store'
import { mutateDraftConfiguration } from '@/features/configuration/editor/document'
import { CheckboxField, NumberField, SelectField } from '@/features/configuration/inspector/fields'
import { SUPPORTED_BAUD_RATES } from '@shared/device'
import {
  TELEMETRY_TRANSPORT_ID_VALUES,
  type TelemetryTransportId
} from '@shared/configuration-schema'
import { effectiveSimHubBaudRate } from '@shared/simhub-profile'
import { t } from '@shared/ui-text'

const TRANSPORT_LABELS: Record<TelemetryTransportId, string> = {
  board_default: 'Board default',
  native_usb_cdc: 'Native USB (CDC)',
  uart: 'UART'
}

export function TransportSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const transport = draft?.telemetry_transport
  const uart = transport?.uart
  const [unlocked, setUnlocked] = useState(false)

  if (!draft) {
    return (
      <PageSection title={t('protocol.transportSection.transport')} collapsible description={t('protocol.transportSection.theLinkTheBoardTalks')}>
        <EmptyState title={t('protocol.transportSection.noConfigurationOpen')}>
          {t('protocol.transportSection.createOrOpenAConfiguration')}</EmptyState>
      </PageSection>
    )
  }

  const writeUart = (mutation: (uart: Record<string, unknown>) => void): void => {
    mutateDraftConfiguration((configuration) => {
      configuration.telemetry_transport ??= {}
      configuration.telemetry_transport.uart ??= {}
      mutation(configuration.telemetry_transport.uart as Record<string, unknown>)
    })
  }

  const baudRate = effectiveSimHubBaudRate(draft)
  const baudOptions = baudRateOptions(baudRate)

  return (
    <PageSection
      title={t('protocol.transportSection.transport')}
      collapsible
      description={t('protocol.transportSection.theLinkTheBoardTalks2')}
      actions={<SaveToBoardButton />}
    >
      <div className="mb-3 space-y-2 rounded-md border border-red-500/40 bg-red-500/10 p-2.5">
        <p className="font-medium text-red-300">{t('protocol.transportSection.changingThisCanCutThe')}</p>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-4 text-red-200/80">
          <li>
            {t('protocol.transportSection.aSavedChangeRestartsThe')}</li>
          <li>
            {t('protocol.transportSection.notEverySpeedSurvivesEvery')}</li>
        </ul>
        <p className="text-[11px] leading-4 text-red-200/80">
          {t('protocol.transportSection.notPermanentBefore')}
          <b>{t('protocol.transportSection.auto')}</b>
          {t('protocol.transportSection.notPermanentAfter')}
        </p>
        <label className="flex items-center gap-2 pt-0.5 text-[11px] text-red-200">
          <input
            checked={unlocked}
            className="size-3.5"
            type="checkbox"
            onChange={(event) => setUnlocked(event.target.checked)}
          />
          {t('protocol.transportSection.iKnowWhatTheseDo')}</label>
      </div>
      <fieldset className="space-y-1 disabled:opacity-50" disabled={!unlocked}>
        <SelectField
          label={t('protocol.transportSection.transport')}
          hint={t('protocol.transportSection.whichLinkCarriesTelemetryAnd')}
          value={transport?.id ?? 'board_default'}
          options={TELEMETRY_TRANSPORT_ID_VALUES}
          modified={transport?.id !== undefined}
          onReset={() =>
            mutateDraftConfiguration((configuration) => {
              if (configuration.telemetry_transport) {
                delete configuration.telemetry_transport.id
              }
            })
          }
          onChange={(id) =>
            mutateDraftConfiguration((configuration) => {
              configuration.telemetry_transport ??= {}
              configuration.telemetry_transport.id = id as TelemetryTransportId
            })
          }
        />
        <p className="pb-1 text-[11px] text-muted-foreground">
          {TRANSPORT_LABELS[transport?.id ?? 'board_default']} —{' '}
          {transport?.id === 'uart'
            ? t('protocol.transportSection.theBoardSUartPins')
            : transport?.id === 'native_usb_cdc'
              ? t('protocol.transportSection.theChipSOwnUsb')
              : t('protocol.transportSection.whateverThisBoardWasBuilt')}
        </p>

        <SelectField
          label={t('device.infoPage.speed')}
          hint={t('protocol.transportSection.bitsPerSecondOnThe')}
          value={String(baudRate)}
          options={baudOptions}
          modified={uart?.baud_rate !== undefined}
          onReset={() => writeUart((current) => delete current.baud_rate)}
          onChange={(value) => writeUart((current) => (current.baud_rate = Number(value)))}
        />
      </fieldset>

      <details className="mt-3 rounded-md border">
        <summary className="cursor-pointer px-3 py-2 font-medium">{t('protocol.transportSection.uARTPins')}</summary>
        <fieldset className="space-y-1 border-t p-2 disabled:opacity-50" disabled={!unlocked}>
          <p className="pb-1 text-[11px] text-muted-foreground">
            {t('protocol.transportSection.theFirmwareChecksTheseAgainst')}</p>
          <NumberField
            label={t('protocol.transportSection.tXPin')}
            value={uart?.tx_pin ?? 43}
            min={0}
            max={63}
            modified={uart?.tx_pin !== undefined}
            onReset={() => writeUart((current) => delete current.tx_pin)}
            onChange={(value) => writeUart((current) => (current.tx_pin = value))}
          />
          <NumberField
            label={t('protocol.transportSection.rXPin')}
            value={uart?.rx_pin ?? 44}
            min={0}
            max={63}
            modified={uart?.rx_pin !== undefined}
            onReset={() => writeUart((current) => delete current.rx_pin)}
            onChange={(value) => writeUart((current) => (current.rx_pin = value))}
          />
          <NumberField
            label={t('device.infoPage.port')}
            value={uart?.port ?? 0}
            min={0}
            max={2}
            modified={uart?.port !== undefined}
            onReset={() => writeUart((current) => delete current.port)}
            onChange={(value) => writeUart((current) => (current.port = value))}
          />
          <CheckboxField
            label={t('protocol.transportSection.silenceEspLogs')}
            hint={t('protocol.transportSection.keepsTheFirmwareSOwn')}
            checked={uart?.silence_esp_logs ?? true}
            modified={uart?.silence_esp_logs !== undefined}
            onReset={() => writeUart((current) => delete current.silence_esp_logs)}
            onChange={(checked) => writeUart((current) => (current.silence_esp_logs = checked))}
          />
        </fieldset>
      </details>
    </PageSection>
  )
}

function baudRateOptions(effective: number): readonly string[] {
  const rates = SUPPORTED_BAUD_RATES.map(String)
  const value = String(effective)
  return rates.includes(value) ? rates : [value, ...rates]
}
