import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { useFirmwareUpdateStore } from './firmware-update-store'

// Updating firmware over the same serial link the dashboard is configured on.
// The board keeps two application slots and runs the one it was last told to;
// an upload fills the other, so a failed image costs a restart rather than a
// cable.
export function FirmwareUpdatePanel(): React.JSX.Element {
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

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>Firmware</CardTitle>
        <CardDescription>
          {firmware
            ? 'Installs into the slot the board is not running from. The new image takes over at the next restart.'
            : 'The connected firmware cannot update itself over serial.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-xs">
        {firmware ? (
          <div className="space-y-1 rounded-md border bg-muted/20 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Running</span>
              <span className="min-w-0 truncate">{`${firmware.running} · ${firmware.version}`}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Installs into</span>
              <span className="min-w-0 truncate">{firmware.target}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Connect a board with two firmware slots.</p>
        )}

        {source ? (
          <div className="flex items-center justify-between gap-2 rounded-md border p-2">
            <span className="min-w-0 truncate" title={source.name}>
              {source.name}
            </span>
            <span className="flex-none text-muted-foreground">{`${source.size} bytes`}</span>
          </div>
        ) : null}

        {firmware?.pendingVerify ? (
          <p className="text-amber-400">
            This image has not been confirmed yet. A restart now returns the board to the previous
            firmware.
          </p>
        ) : null}
        {firmware?.rebootRequired ? (
          <p className="text-amber-400">Restart the board to run the firmware already installed.</p>
        ) : null}
        {progress ? (
          <p className="text-muted-foreground">
            {`${progress.message}${progress.total > 0 ? ` (${Math.round((progress.completed / progress.total) * 100)}%)` : ''}`}
          </p>
        ) : null}
        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={busy || !firmware}
            onClick={() => void selectSource()}
          >
            Select image
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
        {firmware?.rebootRequired && !running ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void window.simcore.rebootDevice()}
          >
            Restart board
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
