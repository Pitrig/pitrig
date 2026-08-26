import { useState } from 'react'

import { WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { renameWidget } from '../dashboard-editor'

export function RenameField({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  const [value, setValue] = useState(id)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
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
