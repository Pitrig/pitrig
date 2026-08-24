import { Plug } from 'lucide-react'

import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import { CONFIGURATION_DOCUMENT_LABELS } from '@shared/configuration-documents'
import type {
  ConfigurationDocumentOutcome,
  ConfigurationDocumentState
} from '@shared/device'
import { useAppInfo } from './app-info'
import { describeBootFailures, describeLastBoot } from './device-health'
import { useDeviceStore } from './device-store'

/**
 * What the connected board is, and what this application is.
 *
 * Everything here is read-only, and deliberately so: the things one could *do*
 * to a board — erase its fonts, erase its images, reset its configuration,
 * restart it — live beside the thing they affect, on the page that shows it.
 * A page of facts is a page you can read without worrying about what you click.
 */

/**
 * One document's stored record in a phrase. `absent` is not a fault — it is a
 * board running that section's factory values — so it reads as a state rather
 * than as an error, while everything between it and `valid` names what went
 * wrong with bytes that were there.
 */
const DOCUMENT_STATE_LABELS: Record<ConfigurationDocumentOutcome, string> = {
  absent: 'Factory defaults',
  malformed_record: 'Stored record is malformed; ignored',
  unsupported_schema: 'Stored for another schema version; ignored',
  corrupt_payload: 'Stored record failed its checksum; ignored',
  rejected: 'Stored record was refused; ignored',
  valid: 'Stored'
}

function describeDocumentState(state: ConfigurationDocumentState): string {
  const label = DOCUMENT_STATE_LABELS[state.outcome]
  return state.outcome === 'valid' ? `${label} · generation ${state.generation}` : label
}

export function InfoPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const status = useDeviceStore((state) => state.status)
  const connection = useDeviceStore((state) => state.connection)
  const error = useDeviceStore((state) => state.error)
  const appInfo = useAppInfo()

  return (
    <PageShell title="Info" description="The connected board, the link, and this application.">
      <PageSection
        title="Board"
        description={
          session
            ? 'Reported by the firmware itself. Nothing here is editable.'
            : 'Connect a SimCore board to read its information.'
        }
      >
        {session ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="Board" value={session.info.boardId} />
            <ReadOnlyField
              label="Display"
              value={`${session.info.display.width} × ${session.info.display.height}`}
            />
            <ReadOnlyField label="Firmware" value={session.info.firmwareVersion} />
            <ReadOnlyField label="Schema version" value={String(session.info.schemaVersion)} />
            {CONFIGURATION_DOCUMENT_IDS.map((id) => (
              <ReadOnlyField
                key={id}
                label={`${CONFIGURATION_DOCUMENT_LABELS[id]} config`}
                value={describeDocumentState(session.info.documents[id])}
              />
            ))}
            <ReadOnlyField
              label="Persistent storage"
              value={session.info.storageAvailable ? 'Available' : 'Unavailable'}
            />
            <ReadOnlyField
              label="Firmware slots"
              value={
                session.firmware
                  ? `${session.firmware.running} running · installs into ${session.firmware.target}`
                  : 'Single application partition'
              }
            />
            {/* Absent on firmware built before the boot guard, which reports
                none of this. Three fields rather than one: whether the board is
                running everything, how it got here, and how close it is to
                falling back to the link. */}
            {session.info.health ? (
              <>
                <ReadOnlyField
                  label="Startup"
                  value={
                    session.info.health.safeMode
                      ? 'Safe mode — serial link only'
                      : 'Normal — everything composed'
                  }
                />
                <ReadOnlyField label="Last boot" value={describeLastBoot(session.info.health)} />
                <ReadOnlyField
                  label="Recent failures"
                  value={describeBootFailures(session.info.health)}
                />
              </>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={<Plug aria-hidden="true" className="size-6" />}
            title="No board connected"
          >
            Pick a port at the top of the window, or leave it on Auto and press Connect — the
            configurator walks the speeds a SimCore board answers on.
          </EmptyState>
        )}
      </PageSection>

      <PageSection title="Connection" description="The serial link this window is using.">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label="Status" value={status} />
          <ReadOnlyField label="Port" value={connection?.displayName ?? 'Not connected'} />
          <ReadOnlyField label="Path" value={connection?.path ?? '—'} />
          <ReadOnlyField
            label="Speed"
            value={connection ? `${connection.baudRate} baud` : '—'}
          />
        </div>
        {error ? <p className="mt-3 text-[11px] text-red-400">{error.message}</p> : null}
      </PageSection>

      <PageSection title="Application" description="This build of the configurator.">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label="Name" value={appInfo?.name ?? '—'} />
          <ReadOnlyField label="Version" value={appInfo?.version ?? '—'} />
          <ReadOnlyField label="Platform" value={appInfo?.platform ?? '—'} />
        </div>
      </PageSection>
    </PageShell>
  )
}
