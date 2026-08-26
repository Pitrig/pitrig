import { useState } from 'react'
import { screensOf } from '@shared/configuration-access'
import { WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import {
  MAXIMUM_SCREENS,
  addScreen,
  deleteScreen,
  moveScreen,
  renameScreen,
  useDashboardEditorStore
} from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { screenName } from './screen-name'

export function ScreenTabs(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
  const [dragged, setDragged] = useState<number>()
  const [dropTarget, setDropTarget] = useState<{ index: number; before: boolean }>()
  const [renaming, setRenaming] = useState<number>()
  const screens = screensOf(configuration)
  const count = Math.max(screens.length, 1)
  const reorderable = screens.length > 1

  const edgeAt = (event: React.DragEvent<HTMLElement>): boolean => {
    const box = event.currentTarget.getBoundingClientRect()
    return box.width > 0 ? event.clientX - box.left < box.width / 2 : true
  }
  const destinationOf = (from: number, index: number, before: boolean): number => {
    const at = before ? index : index + 1
    return at > from ? at - 1 : at
  }

  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const edge = dropTarget?.index === index ? dropTarget.before : undefined
        const name = screenName(screens, index)
        return (
        <div
          key={screens[index]?.id ?? index}
          draggable={reorderable && renaming !== index}
          title={
            reorderable
              ? `${name} · double-click to rename · drag to reorder`
              : `${name} · double-click to rename`
          }
          className={`relative flex h-7 items-center rounded-md border px-2 hover:bg-muted ${
            index === activeScreenIndex ? 'bg-muted font-medium' : ''
          } ${dragged === index ? 'opacity-50' : ''}`}
          onDragStart={(event) => {
            setDragged(index)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            if (dragged === undefined) return
            const before = edgeAt(event)
            if (destinationOf(dragged, index, before) === dragged) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (dropTarget?.index !== index || dropTarget.before !== before) {
              setDropTarget({ index, before })
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragged !== undefined) {
              moveScreen(dragged, destinationOf(dragged, index, edgeAt(event)))
            }
            setDragged(undefined)
            setDropTarget(undefined)
          }}
          onDragEnd={() => {
            setDragged(undefined)
            setDropTarget(undefined)
          }}
          onDragLeave={() => {
            setDropTarget((current) => (current?.index === index ? undefined : current))
          }}
        >
          {edge !== undefined ? (
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 w-0.5 bg-sky-400 ${
                edge ? '-left-px' : '-right-px'
              }`}
            />
          ) : null}
          {renaming === index ? (
            <ScreenNameField
              index={index}
              name={name}
              onDone={() => setRenaming(undefined)}
            />
          ) : (
            <button
              type="button"
              aria-pressed={index === activeScreenIndex}
              className="max-w-28 truncate"
              onClick={() => setActiveScreen(index)}
              onDoubleClick={() => {
                setActiveScreen(index)
                setRenaming(index)
              }}
            >
              {name}
            </button>
          )}
        </div>
        )
      })}
      {count < MAXIMUM_SCREENS ? (
        <button
          type="button"
          title="Add a screen"
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => {
            const index = addScreen()
            if (index !== undefined) setActiveScreen(index)
          }}
        >
          +
        </button>
      ) : null}
      {activeScreenIndex > 0 ? (
        <button
          type="button"
          title={`Delete ${screenName(screens, activeScreenIndex)} and everything on it`}
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => deleteScreen(activeScreenIndex)}
        >
          −
        </button>
      ) : null}
    </>
  )
}

function ScreenNameField({
  index,
  name,
  onDone
}: {
  index: number
  name: string
  onDone: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(name)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    if (value !== name && !renameScreen(index, value)) {
      setRejected(true)
      setValue(name)
      return
    }
    onDone()
  }
  return (
    <input
      autoFocus
      aria-label="Screen name"
      value={value}
      maxLength={WIDGET_ID_CAPACITY - 1}
      className={`w-24 min-w-0 rounded-sm border bg-transparent px-1 ${
        rejected ? 'border-red-500' : ''
      }`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
    />
  )
}
