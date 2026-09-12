import { useEffect } from 'react'

import { writeEventLogBatch } from '@/lib/event-log'

const MAXIMUM_LOGGED_DATA = 512

export function useSerialTraffic(): void {
  useEffect(
    () =>
      window.pitrig.onSerialTraffic((logs) => {
        writeEventLogBatch(
          logs.map((log) => ({
            message: `Serial ${log.direction.toUpperCase()} · ${log.path} @ ${log.baudRate}${
              log.encoding === 'hex' ? ' · hex' : ''
            }`,
            data: clip(log.data)
          }))
        )
      }),
    []
  )
}

function clip(data: string): string {
  if (data.length <= MAXIMUM_LOGGED_DATA) return data
  return `${data.slice(0, MAXIMUM_LOGGED_DATA)}… ${data.length - MAXIMUM_LOGGED_DATA} more characters`
}
