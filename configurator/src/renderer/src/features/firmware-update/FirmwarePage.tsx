import { Cpu } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useFirmwareUpdateStore } from './firmware-update-store'

export function FirmwarePage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const source = useFirmwareUpdateStore((state) => state.source)
  const progress = useFirmwareUpdateStore((state) => state.progress)
  const error = useFirmwareUpdateStore((state) => state.error)
  const running = useFirmwareUpdateStore((state) => state.operationStartedAt !== undefined)
  const store = useFirmwareUpdateStore
  const [busy, setBusy] = useState(false)

  useEffect(() => window.simcore.onFirmwareUploadProgress(store.getState().setProgress), [store])

  const firmware = session?.firmware
  const uploadable =
    Boolean(source) && Boolean(firmware?.storageAvailable) && !firmware?.rebootRequired && !busy

  const selectSource = async (): Promise<void> => {
    setBusy(true)
    store.getState().setError(undefined)
    try {
      const result = await window.simcore.selectFirmwareSource()
      if (!result.ok) store.getState().setError(result.error.message)
      else if (result.value) store.getState().setSource(result.value)
    } finally {
      setBusy(false)
    }
  }

  const upload = async (): Promise<void> => {
    if (!source) return
    setBusy(true)
    store.getState().beginOperation()
    try {
      const result = await window.simcore.uploadFirmware({ sourceId: source.id })
      if (!result.ok) store.getState().setError(result.error.message)
    } finally {
      store.getState().endOperation()
      setBusy(false)
    }
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0

  return (
    <PageShell
      title="Firmware"
      description="Install a firmware image into the slot the board is not running from."
      actions={
        firmware?.rebootRequired && !running ? (
          <Button onClick={() => void window.simcore.rebootDevice()}>Restart board</Button>
        ) : null
      }
    >
      {firmware ? (
        <>
          <PageSection
            title="Slots"
            description="The image takes over at the next restart; a startup that never finishes returns the board to the slot it came from."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <ReadOnlyField label="Running" value={firmware.running} />
              <ReadOnlyField label="Version" value={firmware.version} />
              <ReadOnlyField label="Installs into" value={firmware.target} />
            </div>
            {firmware.pendingVerify ? (
              <p className="mt-3 text-[11px] text-amber-400">
                This image has not been confirmed yet. A restart now returns the board to the
                previous firmware.
              </p>
            ) : null}
            {firmware.rebootRequired ? (
              <p className="mt-3 text-[11px] text-amber-400">
                Restart the board to run the firmware already installed.
              </p>
            ) : null}
          </PageSection>

          <PageSection
            title="Image"
            description="A packaged SimCore firmware image, named for the board it was built for."
          >
            <div className="space-y-3">
              {source ? (
                <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="min-w-0 truncate" title={source.name}>
                    {source.name}
                  </span>
                  <span className="flex-none text-muted-foreground">{`${source.size} bytes`}</span>
                </div>
              ) : (
                <p className="text-muted-foreground">No image selected.</p>
              )}

              {progress ? (
                <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-sky-500 transition-[width]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="break-words">
                    {progress.message}
                    {progress.total > 0 ? ` (${percent}%)` : ''}
                  </p>
                </div>
              ) : null}
              {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void selectSource()}
                >
                  Select image…
                </Button>
                <Button className="flex-1" disabled={!uploadable} onClick={() => void upload()}>
                  {running ? 'Installing…' : 'Install'}
                </Button>
              </div>
              {running ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => void window.simcore.cancelFirmwareUpload()}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </PageSection>
        </>
      ) : (
        <PageSection title="Not available" description="What this board can do over serial.">
          <EmptyState icon={<Cpu aria-hidden="true" className="size-6" />} title="No second slot">
            {session
              ? 'The connected firmware predates the two-slot partition layout, so it cannot replace itself over serial. Flash it once over USB with idf.py, and every update after that can come this way.'
              : 'Connect a board with two firmware slots.'}
          </EmptyState>
        </PageSection>
      )}
    </PageShell>
  )
}
