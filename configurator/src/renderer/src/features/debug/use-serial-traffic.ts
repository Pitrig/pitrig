import { useEffect } from 'react'

import { writeDebugLog } from './debug-log'

/**
 * Records the serial link's traffic into the debug log for as long as the
 * application is running.
 *
 * It is mounted once by the window rather than by the Debug page: a log that
 * only records while you are looking at it cannot answer the question you open
 * it to ask, which is what the board said a minute ago.
 */
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
