import { useEffect } from 'react'

import { writeDebugLogBatch } from './debug-log'

export function useSerialTraffic(): void {
  useEffect(
    () =>
      window.simcore.onSerialTraffic((logs) => {
        writeDebugLogBatch(
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
