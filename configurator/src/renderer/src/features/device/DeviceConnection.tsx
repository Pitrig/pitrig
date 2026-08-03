import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  DeviceResult,
  DeviceState,
  DeviceStatus,
  SerialPortSummary
} from '../../../../shared/device'

const AUTO_PORT_ID = 'auto'
const DEFAULT_BAUD_RATE = 115_200
const MANUAL_BAUD_RATES = [
  9_600,
  19_200,
  38_400,
  57_600,
  115_200,
  230_400,
  460_800,
  921_600
] as const
const STATUS_BADGE_STYLES: Record<DeviceStatus, { badge: string; indicator: string }> = {
  disconnected: {
    badge: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
    indicator: 'bg-zinc-400'
  },
  scanning: {
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    indicator: 'animate-pulse bg-sky-400'
  },
  connecting: {
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    indicator: 'animate-pulse bg-sky-400'
  },
  connected: {
    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    indicator: 'bg-emerald-400'
  },
  disconnecting: {
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    indicator: 'animate-pulse bg-amber-400'
  },
  error: {
    badge: 'border-red-500/40 bg-red-500/15 text-red-300',
    indicator: 'bg-red-400'
  }
}

export function DeviceConnection(): React.JSX.Element {
  const [ports, setPorts] = useState<SerialPortSummary[]>([])
  const [selectedPortId, setSelectedPortId] = useState(AUTO_PORT_ID)
  const [selectedBaudRate, setSelectedBaudRate] = useState(String(DEFAULT_BAUD_RATE))
  const [state, setState] = useState<DeviceState>({ status: 'disconnected' })
  const [listError, setListError] = useState<string>()

  const applyPortResult = useCallback((result: DeviceResult<SerialPortSummary[]>): void => {
    if (!result.ok) {
      setListError(result.error.message)
      return
    }
    setListError(undefined)
    setPorts(result.value)
    setSelectedPortId((current) =>
      current !== AUTO_PORT_ID && !result.value.some(({ id }) => id === current)
        ? AUTO_PORT_ID
        : current
    )
  }, [])

  const refreshPorts = useCallback(async (): Promise<void> => {
    applyPortResult(await window.simcore.listSerialPorts())
  }, [applyPortResult])

  useEffect(() => {
    void window.simcore.getDeviceState().then(setState)
    void window.simcore.listSerialPorts().then(applyPortResult)
    return window.simcore.onDeviceStateChanged(setState)
  }, [applyPortResult])

  const isWorking = ['scanning', 'connecting', 'disconnecting'].includes(state.status)
  const statusText = useMemo(() => formatStatus(state, listError), [state, listError])
  const statusBadgeStyle = STATUS_BADGE_STYLES[state.status]
  const showDetailedStatus =
    selectedPortId === AUTO_PORT_ID && (state.status === 'connected' || state.status === 'error')

  const connect = async (): Promise<void> => {
    if (selectedPortId === AUTO_PORT_ID) {
      await window.simcore.autoConnectDevice()
      return
    }
    await window.simcore.connectDevice({
      portId: selectedPortId,
      baudRate: Number(selectedBaudRate)
    })
  }

  const primaryAction = async (): Promise<void> => {
    if (state.status === 'connected' || state.status === 'error') {
      await window.simcore.disconnectDevice()
    } else if (state.status === 'scanning' || state.status === 'connecting') {
      await window.simcore.cancelAutoConnect()
    } else {
      await connect()
    }
  }

  const actionLabel =
    state.status === 'connected'
      ? 'Disconnect'
      : state.status === 'error'
        ? 'Reset'
      : state.status === 'scanning' || state.status === 'connecting'
        ? 'Cancel'
        : state.status === 'disconnecting'
          ? 'Disconnecting…'
          : 'Connect'

  return (
    <div className="flex items-center gap-2">
      <div className="hidden w-72 flex-none justify-end xl:flex">
        <span
          aria-hidden={!showDetailedStatus}
          className={`truncate text-xs ${showDetailedStatus ? 'visible' : 'invisible'}`}
        >
          {statusText}
        </span>
      </div>

      <select
        aria-label="Serial port"
        className="h-8 w-64 flex-none rounded-md border bg-background px-2 text-xs"
        value={selectedPortId}
        disabled={isWorking || state.status === 'connected'}
        onChange={(event) => setSelectedPortId(event.target.value)}
      >
        <option value={AUTO_PORT_ID}>Auto — detect port and speed</option>
        {ports.map((port) => (
          <option key={port.id} value={port.id}>
            {port.displayName}
          </option>
        ))}
      </select>

      <div className="w-28 flex-none">
        {selectedPortId !== AUTO_PORT_ID ? (
          <select
            aria-label="Baud rate"
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            value={selectedBaudRate}
            disabled={isWorking || state.status === 'connected'}
            onChange={(event) => setSelectedBaudRate(event.target.value)}
          >
            {MANUAL_BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <Button
        className="w-20 flex-none"
        variant="outline"
        disabled={isWorking || state.status === 'connected'}
        onClick={() => void refreshPorts()}
      >
        Refresh
      </Button>
      <Button
        className="w-28 flex-none"
        disabled={state.status === 'disconnecting'}
        onClick={() => void primaryAction()}
      >
        {actionLabel}
      </Button>
      <Badge
        className={`w-24 flex-none justify-center gap-1.5 ${statusBadgeStyle.badge}`}
        variant="outline"
      >
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${statusBadgeStyle.indicator}`}
        />
        {state.status}
      </Badge>
    </div>
  )
}

function formatStatus(state: DeviceState, listError?: string): string {
  if (listError) {
    return listError
  }
  if (state.connection) {
    return `${state.connection.displayName} at ${state.connection.baudRate}`
  }
  if (state.scan) {
    return `Scanning ${state.scan.displayName} at ${state.scan.baudRate}`
  }
  if (state.error) {
    return state.error.message
  }
  return 'Device disconnected'
}
