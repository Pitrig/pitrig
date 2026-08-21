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
  // Which edge of which tab the drop would land on. One object for the strip
  // rather than a flag per tab, as the layer list does it.
  const [dropTarget, setDropTarget] = useState<{ index: number; before: boolean }>()
  const [renaming, setRenaming] = useState<number>()
  const screens = screensOf(configuration)
  const count = Math.max(screens.length, 1)
  // A single screen has no order to change, and a sparse document can show a
  // tab for a screen the array does not hold yet.
  const reorderable = screens.length > 1

  // Where the pointer sits on the tab, and what that means to an array the
  // dragged screen is spliced out of first: a landing spot after the one it
  // came from shifts back by one.
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
          // Dragging is off while the name is being typed: a press inside the
          // field would otherwise pick the tab up instead of placing the caret.
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
            // A drop that would put the screen back where it started is not
            // offered at all, so no band is ever a move that does nothing.
            if (destinationOf(dragged, index, before) === dragged) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (dropTarget?.index !== index || dropTarget.before !== before) {
              setDropTarget({ index, before })
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            // Recomputed from the drop itself: the stored edge is a render behind.
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
            // Only if this tab is still the marked one. Leaving one tab and
            // entering the next fire in either order, and an unguarded clear
            // would wipe the indicator the tab being entered had just set.
            setDropTarget((current) => (current?.index === index ? undefined : current))
          }}
        >
          {/* Absolute and click-through, for the same reason the layer list's
              indicator is: an element under the cursor would swallow the
              dragover this exists to reflect. */}
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

/**
 * Renaming a screen in place, on the tab it is named on. The name is a document
 * value rather than a label, so a refused one — empty, longer than the device
 * stores, or already taken by another screen — puts the old name back and marks
 * the field instead of vanishing silently. Repointing the `goto_screen` actions
 * that named it is `renameScreen`'s business.
 */
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
        // The strip is inside the canvas card, where Escape and the arrows mean
        // something else entirely.
        event.stopPropagation()
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
    />
  )
}
