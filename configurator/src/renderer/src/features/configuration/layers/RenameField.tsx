import { useState } from 'react'

import { WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { renameWidget } from '../dashboard-editor'

/**
 * A layer's name is its `id`, which the device stores but never draws — unlike
 * the caption. A rename that would collide or overflow is refused, so the
 * document stays one the board accepts.
 */
export function RenameField({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  const [value, setValue] = useState(id)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    // A refused rename keeps the field open with the old name back, so the
    // reason is visible rather than the edit silently vanishing.
    if (value !== id && !renameWidget(id, value)) {
      setRejected(true)
      setValue(id)
      return
    }
    onDone()
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={WIDGET_ID_CAPACITY - 1}
      className={`min-w-0 flex-1 rounded-md border bg-transparent px-1 ${rejected ? 'border-red-500' : ''}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
    />
  )
}
