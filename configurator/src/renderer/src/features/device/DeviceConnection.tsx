import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { writeEventLog } from '@/lib/event-log'
import { useDeviceStore } from '@/features/device/device-store'
import {
  DEFAULT_BAUD_RATE,
  SUPPORTED_BAUD_RATES,
  type DeviceResult,
  type DeviceState,
  type DeviceStatus,
  type SerialPortSummary
} from '@shared/device'

const AUTO_PORT_ID = 'auto'
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

interface DeviceConnectionProps {
  onDetailedStatusChange: (status: string | undefined) => void
}

export function DeviceConnection({
  onDetailedStatusChange
}: DeviceConnectionProps): React.JSX.Element {
  const [ports, setPorts] = useState<SerialPortSummary[]>([])
  const [selectedPortId, setSelectedPortId] = useState(AUTO_PORT_ID)
  const [selectedBaudRate, setSelectedBaudRate] = useState(String(DEFAULT_BAUD_RATE))
  const applyDeviceState = useDeviceStore((store) => store.applyDeviceState)
  const status = useDeviceStore((store) => store.status)
  const connection = useDeviceStore((store) => store.connection)
  const scan = useDeviceStore((store) => store.scan)
  const error = useDeviceStore((store) => store.error)

  const applyPortResult = useCallback((result: DeviceResult<SerialPortSummary[]>): void => {
    writeEventLog('Serial ports listed', result)
    if (!result.ok) {
      return
    }
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
    void window.simcore.getDeviceState().then((initialState) => {
      writeEventLog('Initial device state', initialState)
      applyDeviceState(initialState)
    })
    void window.simcore.listSerialPorts().then(applyPortResult)
    return window.simcore.onDeviceStateChanged((nextState) => {
      writeEventLog('Device state changed', nextState)
      applyDeviceState(nextState)
    })
  }, [applyDeviceState, applyPortResult])

  const isWorking = ['scanning', 'connecting', 'disconnecting'].includes(status)
  const statusText = formatStatus({ connection, scan, error })
  const statusBadgeStyle = STATUS_BADGE_STYLES[status]
  const showDetailedStatus =
    selectedPortId === AUTO_PORT_ID && (status === 'connected' || status === 'error')

  useEffect(() => {
    onDetailedStatusChange(showDetailedStatus ? statusText : undefined)
  }, [onDetailedStatusChange, showDetailedStatus, statusText])

  const connect = async (): Promise<void> => {
    if (selectedPortId === AUTO_PORT_ID) {
      writeEventLog('Auto-connect requested')
      const result = await window.simcore.autoConnectDevice()
      writeEventLog('Auto-connect completed', result)
      return
    }
    const request = {
      portId: selectedPortId,
      baudRate: Number(selectedBaudRate)
    }
    writeEventLog('Manual connection requested', request)
    const result = await window.simcore.connectDevice(request)
    writeEventLog('Manual connection completed', result)
  }

  const primaryAction = async (): Promise<void> => {
    if (status === 'connected') {
      writeEventLog('Disconnect requested')
      const result = await window.simcore.disconnectDevice()
      writeEventLog('Disconnect completed', result)
    } else if (status === 'error') {
      writeEventLog('Clearing failed device session before retry')
      await window.simcore.disconnectDevice()
      await connect()
    } else if (status === 'scanning' || status === 'connecting') {
      writeEventLog('Connection cancellation requested')
      const result = await window.simcore.cancelAutoConnect()
      writeEventLog('Connection cancellation completed', result)
    } else {
      await connect()
    }
  }

  const actionLabel =
    status === 'connected'
      ? 'Disconnect'
      : status === 'scanning' || status === 'connecting'
        ? 'Cancel'
        : status === 'disconnecting'
          ? 'Disconnecting…'
          : 'Connect'

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Serial port"
        className="h-8 w-64 flex-none rounded-md border bg-background px-2 text-xs"
        value={selectedPortId}
        disabled={isWorking || status === 'connected'}
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
            disabled={isWorking || status === 'connected'}
            onChange={(event) => setSelectedBaudRate(event.target.value)}
          >
            {SUPPORTED_BAUD_RATES.map((rate) => (
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
        disabled={isWorking || status === 'connected'}
        onClick={() => void refreshPorts()}
      >
        Refresh
      </Button>
      <Button
        className="w-28 flex-none"
        disabled={status === 'disconnecting'}
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
        {status}
      </Badge>
    </div>
  )
}

function formatStatus(state: Pick<DeviceState, 'connection' | 'scan' | 'error'>): string {
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
