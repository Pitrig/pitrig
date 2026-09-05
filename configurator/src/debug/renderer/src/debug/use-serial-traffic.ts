import { useEffect } from 'react'

import { writeEventLogBatch } from '@/lib/event-log'

export function useSerialTraffic(): void {
  useEffect(
    () =>
      window.pitrig.onSerialTraffic((logs) => {
        writeEventLogBatch(
          logs.map((log) => ({
            message: `Serial ${log.direction.toUpperCase()} · ${log.path} @ ${log.baudRate}${
              log.encoding === 'hex' ? ' · hex' : ''
            }`,
            data: log.data
          }))
        )
      }),
    []
  )
}
