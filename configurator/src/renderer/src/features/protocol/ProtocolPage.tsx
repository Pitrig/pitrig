import { Radio, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { bridgeErrorMessage } from '@/features/device/bridge-errors'
import { writeDebugLog } from '@/features/debug/debug-log'
import { useDeviceStore } from '@/features/device/device-store'
import { mutateDraftConfiguration } from '@/features/configuration/editor/document'
import { CheckboxField, NumberField, SelectField } from '@/features/configuration/inspector/fields'
import { SUPPORTED_BAUD_RATES } from '@shared/device'
import { TELEMETRY_TRANSPORT_ID_VALUES, type TelemetryTransportId } from '@shared/configuration-schema'
import {
  allTelemetryFieldNames,
  collectDashboardTelemetry,
  effectiveSimHubBaudRate,
  type SimHubProfileMode
} from '@shared/simhub-profile'
import { searchTelemetryReference } from './telemetry-reference'

/**
 * The link between the PC and the board: what feeds it, how it is carried, and
 * what the fields on it are called.
 *
 * The transport half edits the draft document rather than the board directly —
 * `telemetry_transport` is configuration like anything else, so it travels with
 * the dashboard and takes effect the way the rest of it does. Until now it
 * could only be reached through the raw JSON editor.
 */

type Feedback = { kind: 'success' | 'error'; message: string }

const TRANSPORT_LABELS: Record<TelemetryTransportId, string> = {
  board_default: 'Board default',
  native_usb_cdc: 'Native USB (CDC)',
  uart: 'UART'
}

export function ProtocolPage(): React.JSX.Element {
  return (
    <PageShell
      title="Protocol"
      description="Where telemetry comes from, how it reaches the board, and what the fields are called."
    >
      <TelemetrySourceSection />
      <TransportSection />
      <SimHubProfileSection />
      <CatalogSection />
    </PageShell>
  )
}

function TelemetrySourceSection(): React.JSX.Element {
  return (
    <PageSection
      title="Telemetry source"
      description="What produces the values the dashboard draws."
    >
      <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
        <Radio aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted-foreground" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">SimHub</span>
            <Badge variant="outline">In use</Badge>
          </div>
          <p className="text-muted-foreground">
            A Custom Serial Device profile on the PC writes one line per field over the same link
            this configurator uses. It is the only source today; a second one would be chosen here.
          </p>
        </div>
      </div>
    </PageSection>
  )
}

/**
 * The transport properties, out of the raw JSON and into named controls.
 *
 * The pins are behind a fold because they are the one pair of values that can
 * make a board unreachable: firmware validates them against the board's own
 * pin pair and rejects a document that names another, so a wrong number here is
 * a refused save rather than a silent break — but it is still not a number
 * anyone edits by accident.
 */
function TransportSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const transport = draft?.telemetry_transport
  const uart = transport?.uart

  if (!draft) {
    return (
      <PageSection title="Transport" description="How telemetry reaches the board.">
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
      description="Part of the configuration document, so it travels with the dashboard."
    >
      <div className="space-y-1">
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
      </div>

      <details className="mt-3 rounded-md border">
        <summary className="cursor-pointer px-3 py-2 font-medium">UART pins</summary>
        <div className="space-y-1 border-t p-2">
          <p className="pb-1 text-[11px] text-muted-foreground">
            The firmware checks these against the board’s own pin pair and refuses a document that
            names another, so a wrong number costs a refused save rather than a dark board.
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
        </div>
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

function SimHubProfileSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const [mode, setMode] = useState<SimHubProfileMode>('dashboard')
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()

  const selection = useMemo(() => {
    if (!draft) return undefined
    return mode === 'all'
      ? { fieldNames: allTelemetryFieldNames(), unknownBindings: [] }
      : collectDashboardTelemetry(draft)
  }, [mode, draft])
  const baudRate = draft ? effectiveSimHubBaudRate(draft) : undefined
  const blockedReason = !draft
    ? 'The configuration draft is not valid JSON.'
    : selection && selection.unknownBindings.length > 0
      ? `Unknown dashboard bindings: ${selection.unknownBindings.join(', ')}`
      : !selection || selection.fieldNames.length === 0
        ? 'The dashboard does not require any telemetry fields.'
        : undefined

  const exportProfile = async (): Promise<void> => {
    if (!selection || baudRate === undefined || blockedReason) return
    setExporting(true)
    setFeedback(undefined)
    const request = { fieldNames: selection.fieldNames, baudRate }
    writeDebugLog('SimHub profile export requested', {
      mode,
      fieldCount: selection.fieldNames.length,
      baudRate
    })
    try {
      const result = await window.simcore.exportSimHubProfile(request)
      writeDebugLog('SimHub profile export completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
      } else if (result.value.saved) {
        setFeedback({
          kind: 'success',
          message: `${result.value.fileName ?? 'SimHub profile'} saved with ${selection.fieldNames.length} telemetry fields.`
        })
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: bridgeErrorMessage(error, 'Failed to export the SimHub profile.')
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageSection
      title="SimHub profile"
      description="Generate a Custom Serial Device profile that feeds this dashboard."
      actions={
        <Button
          disabled={exporting || blockedReason !== undefined}
          title={blockedReason}
          onClick={() => void exportProfile()}
        >
          {exporting ? 'Generating…' : 'Generate profile'}
        </Button>
      }
    >
      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={exporting}>
        <ProfileModeOption
          checked={mode === 'dashboard'}
          description="Only the bindings and module inputs the current draft uses."
          label="Dashboard only"
          onChange={() => {
            setMode('dashboard')
            setFeedback(undefined)
          }}
        />
        <ProfileModeOption
          checked={mode === 'all'}
          description="The complete canonical telemetry catalog."
          label="All telemetry"
          onChange={() => {
            setMode('all')
            setFeedback(undefined)
          }}
        />
      </fieldset>

      <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
        <span>{selection ? `${selection.fieldNames.length} fields` : 'No valid draft'}</span>
        <span className="text-muted-foreground">
          {baudRate ? `${baudRate} baud` : 'Baud unavailable'}
        </span>
      </div>

      {feedback ? (
        <p
          className={
            feedback.kind === 'error'
              ? 'mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300'
              : 'mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300'
          }
        >
          {feedback.message}
        </p>
      ) : null}
      {!exporting && blockedReason ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{blockedReason}</p>
      ) : null}
    </PageSection>
  )
}

function ProfileModeOption({
  checked,
  description,
  label,
  onChange
}: {
  checked: boolean
  description: string
  label: string
  onChange: () => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer gap-2 rounded-md border p-2">
      <input checked={checked} className="mt-0.5" name="simhub-profile-mode" type="radio" onChange={onChange} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

/** Every field the protocol can carry, and where SimHub reads it from. */
function CatalogSection(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => searchTelemetryReference(query), [query])

  return (
    <PageSection
      title="Telemetry catalog"
      description={`${entries.length} of ${searchTelemetryReference('').length} fields. A widget binds one of these names; the wire id is what actually travels.`}
      actions={
        <label className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label="Search telemetry fields"
            className="w-44 bg-transparent text-xs outline-none"
            placeholder="fuel, rpm, lap…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      className="px-0 pb-0"
    >
      {entries.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title="No field matches">
            Try a shorter word — the search covers the name, the wire id, the unit, the category and
            the SimHub property.
          </EmptyState>
        </div>
      ) : (
        <div className="max-h-96 overflow-auto border-t">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">Field</th>
                <th className="px-2 py-1.5 font-medium">Wire</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Unit</th>
                <th className="px-4 py-1.5 font-medium">SimHub property</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.name} className="border-t align-top">
                  <td className="px-4 py-1.5">
                    <span className="font-mono">{entry.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {entry.description}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{entry.wireId}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{entry.type}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{entry.unit}</td>
                  <td className="px-4 py-1.5">
                    <span
                      className="block max-w-xs truncate font-mono text-[11px] text-muted-foreground"
                      title={entry.simHubProperty}
                    >
                      {entry.simHubProperty ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  )
}
