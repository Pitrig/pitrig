import { Plug } from 'lucide-react'

import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { useAppInfo } from './app-info'
import { useDeviceStore } from './device-store'

/**
 * What the connected board is, and what this application is.
 *
 * Everything here is read-only, and deliberately so: the things one could *do*
 * to a board — erase its fonts, erase its images, reset its configuration,
 * restart it — live beside the thing they affect, on the page that shows it.
 * A page of facts is a page you can read without worrying about what you click.
 */
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
            <ReadOnlyField label="Configuration source" value={session.info.configurationSource} />
            <ReadOnlyField label="Generation" value={String(session.info.generation)} />
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
