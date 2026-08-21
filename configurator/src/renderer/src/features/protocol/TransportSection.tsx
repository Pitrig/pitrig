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

const TRANSPORT_LABELS: Record<TelemetryTransportId, string> = {
  board_default: 'Board default',
  native_usb_cdc: 'Native USB (CDC)',
  uart: 'UART'
}

export function TransportSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const transport = draft?.telemetry_transport
  const uart = transport?.uart
  // Locked on arrival, and locked again every time the page is left. That is
  // the point of it: this is the one section whose settings decide whether the
  // configurator can reach the board at all, and an author who has come here to
  // read should not be one stray scroll-over-a-select away from changing it.
  const [unlocked, setUnlocked] = useState(false)

  if (!draft) {
    return (
      <PageSection title="Transport" collapsible description="The link the board talks over.">
        <EmptyState title="No configuration open">
          Create or open a configuration on the Configs page first — the transport travels with the
          dashboard rather than being set on the board.
        </EmptyState>
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

  // The shown value is the effective one, not the authored one: a sparse
  // document usually names no rate, and a select with nothing selected reads as
  // broken rather than as "the contract default applies".
  const baudRate = effectiveSimHubBaudRate(draft)
  const baudOptions = baudRateOptions(baudRate)

  return (
    <PageSection
      title="Transport"
      collapsible
      // Folded, so this line is all an author sees until they open it — which
      // makes it the place the warning inside has to be hinted at.
      description="The link the board talks over. Its own stored configuration, saved and restarted on its own — and changing it can cut the board off."
      actions={<SaveToBoardButton />}
    >
      {/* The settings that decide whether this application can talk to the board
          at all. Everything else on the page describes the link; this one is the
          link. It is also the one setting a save cannot make true on its own:
          the firmware stores the protocol document and answers that a restart is
          owed, because the link is selected once at startup. */}
      <div className="mb-3 space-y-2 rounded-md border border-red-500/40 bg-red-500/10 p-2.5">
        <p className="font-medium text-red-300">Changing this can cut the board off</p>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-4 text-red-200/80">
          <li>
            A saved change restarts the board, and the board comes back on the new link — at the
            new speed, if that is what changed. This window reconnects at the old one and will
            report that the board did not come back.
          </li>
          <li>
            Not every speed survives every board. A USB-serial bridge is what limits it, not the
            firmware, and a rate the bridge cannot hold leaves a board that answers nothing.
          </li>
        </ul>
        <p className="text-[11px] leading-4 text-red-200/80">
          Nothing here is permanent: <b>Auto</b> at the top of the window walks the speeds a
          SimCore board answers on, and a board that cannot be reached at all can still be flashed
          over USB.
        </p>
        <label className="flex items-center gap-2 pt-0.5 text-[11px] text-red-200">
          <input
            checked={unlocked}
            className="size-3.5"
            type="checkbox"
            onChange={(event) => setUnlocked(event.target.checked)}
          />
          I know what these do — let me change them
        </label>
      </div>
      <fieldset className="space-y-1 disabled:opacity-50" disabled={!unlocked}>
        <SelectField
          label="Transport"
          hint="Which link carries telemetry and @SC: control. The board default is what the firmware was built for."
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
            ? 'the board’s UART pins, reached through a USB-serial bridge.'
            : transport?.id === 'native_usb_cdc'
              ? 'the chip’s own USB port, no bridge in between.'
              : 'whatever this board was built to use.'}
        </p>

        <SelectField
          label="Speed"
          hint="Bits per second on the UART link. A USB-serial bridge is what limits this, not the board."
          value={String(baudRate)}
          options={baudOptions}
          modified={uart?.baud_rate !== undefined}
          onReset={() => writeUart((current) => delete current.baud_rate)}
          onChange={(value) => writeUart((current) => (current.baud_rate = Number(value)))}
        />
      </fieldset>

      <details className="mt-3 rounded-md border">
        <summary className="cursor-pointer px-3 py-2 font-medium">UART pins</summary>
        <fieldset className="space-y-1 border-t p-2 disabled:opacity-50" disabled={!unlocked}>
          <p className="pb-1 text-[11px] text-muted-foreground">
            The firmware checks these against the board’s own pin pair and refuses a document that
            names another, so a wrong number costs a refused save rather than a dark board — the
            one setting here that cannot go wrong quietly.
          </p>
          <NumberField
            label="TX pin"
            value={uart?.tx_pin ?? 43}
            min={0}
            max={63}
            modified={uart?.tx_pin !== undefined}
            onReset={() => writeUart((current) => delete current.tx_pin)}
            onChange={(value) => writeUart((current) => (current.tx_pin = value))}
          />
          <NumberField
            label="RX pin"
            value={uart?.rx_pin ?? 44}
            min={0}
            max={63}
            modified={uart?.rx_pin !== undefined}
            onReset={() => writeUart((current) => delete current.rx_pin)}
            onChange={(value) => writeUart((current) => (current.rx_pin = value))}
          />
          <NumberField
            label="Port"
            value={uart?.port ?? 0}
            min={0}
            max={2}
            modified={uart?.port !== undefined}
            onReset={() => writeUart((current) => delete current.port)}
            onChange={(value) => writeUart((current) => (current.port = value))}
          />
          <CheckboxField
            label="Silence ESP logs"
            hint="Keeps the firmware's own log off the telemetry link, where it would be read as malformed lines."
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

/**
 * A speed list that always contains the value being shown. A document written
 * for a rate this build does not offer would otherwise show an empty select and
 * silently rewrite itself on the next change.
 */
function baudRateOptions(effective: number): readonly string[] {
  const rates = SUPPORTED_BAUD_RATES.map(String)
  const value = String(effective)
  return rates.includes(value) ? rates : [value, ...rates]
}
