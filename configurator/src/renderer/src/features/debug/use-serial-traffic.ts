import { useEffect } from 'react'

import { writeDebugLog } from './debug-log'

export function useSerialTraffic(): void {
  useEffect(
    () =>
      window.simcore.onSerialTraffic((log) => {
        writeDebugLog(
          `Serial ${log.direction.toUpperCase()} · ${log.path} @ ${log.baudRate}${
            log.encoding === 'hex' ? ' · hex' : ''
          }`,
          log.data
        )
      }),
    []
  )
}
