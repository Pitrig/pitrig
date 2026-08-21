import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HueSlider, SaturationSquare } from './color-picker-controls'
import { parseHex, rgbToHsv, hsvToRgb, toHex, clamp, type Channels } from './color-math'
import { Pipette } from 'lucide-react'
import type { RgbColor } from '@shared/configuration-schema'
import { dashboardPalette } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * The colour picker, rather than the browser's.
 *
 * The native `<input type="color">` popup is drawn by the browser outside the
 * document, so nothing can be added to it — which left the colours already on
 * the dashboard stranded under the field, taking a row from every colour
 * property on screen. Rebuilding the popup is what puts them where they belong:
 * inside it, under the channels, one click from the surface being edited.
 *
 * Hue is held here rather than read back from the colour, because black and
 * grey have none to read: dragging value down to zero and back up would
 * otherwise return red instead of the colour it started from.
 */

interface EyeDropperResult {
  sRGBHex: string
}

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<EyeDropperResult> }
  }
}

const MARGIN = 6
const WIDTH_PX = 232
/** Below this much room underneath, the popup goes above the swatch instead. */
const NEEDED_PX = 300

export function ColorPicker({
  value,
  label,
  onChange,
  onClose
}: {
  value: string
  label: string
  onChange: (value: RgbColor) => void
  /** Ends the edit group a drag opened, exactly as leaving the hex field does. */
  onClose: () => void
}): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number }>()
  const rgb = parseHex(value) ?? { r: 0, g: 0, b: 0 }
  const hsv = rgbToHsv(rgb)
  const [hue, setHue] = useState(hsv.h)
  const activeHue = hsv.s === 0 || hsv.v === 0 ? hue : hsv.h
  const emit = (next: Channels): void => onChange(toHex(next))

  useEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - MARGIN * 2
      const upward = below < NEEDED_PX && rect.top > below
      setAnchor({
        left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH_PX - MARGIN)),
        top: upward ? undefined : rect.bottom + MARGIN,
        bottom: upward ? window.innerHeight - rect.top + MARGIN : undefined
      })
    }
    const close = (): void => {
      setOpen(false)
      onClose()
    }
    const away = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (popover.current?.contains(target) || trigger.current?.contains(target)) return
      close()
    }
    // Captured on the window so it runs before the editor's own shortcuts:
    // Escape with a popup open means "close the popup", and letting it through
    // would clear the selection out from under the widget being edited.
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    place()
    // Positioned in viewport coordinates, so it has to follow the swatch when
    // the inspector scrolls under it.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open, onClose])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`${label} picker`}
        aria-expanded={open}
        title={value}
        className="size-7 flex-none rounded border bg-background p-0.5"
        onClick={() => {
          if (open) {
            setOpen(false)
            onClose()
            return
          }
          setOpen(true)
        }}
      >
        <span className="block size-full rounded-sm" style={{ backgroundColor: value }} />
      </button>
      {open && anchor
        ? createPortal(
            <div
              ref={popover}
              role="dialog"
              aria-label={`${label} picker`}
              className="fixed z-50 overflow-hidden rounded-md border bg-background text-xs shadow-lg"
              style={{ left: anchor.left, top: anchor.top, bottom: anchor.bottom, width: WIDTH_PX }}
            >
              <SaturationSquare
                hue={activeHue}
                hsv={hsv}
                onChange={(saturation, brightness) => emit(hsvToRgb(activeHue, saturation, brightness))}
              />
              <div className="space-y-2 p-2">
                <div className="flex items-center gap-2">
                  {window.EyeDropper ? (
                    <button
                      type="button"
                      aria-label="Pick a colour from the screen"
                      title="Pick a colour from the screen"
                      className="flex-none rounded p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const dropper = window.EyeDropper
                        if (!dropper) return
                        void new dropper()
                          .open()
                          .then(({ sRGBHex }) => {
                            const picked = parseHex(sRGBHex)
                            if (picked) emit(picked)
                          })
                          // Dismissing the eyedropper rejects, and that is a
                          // cancel rather than a failure.
                          .catch(() => undefined)
                      }}
                    >
                      <Pipette aria-hidden className="size-4" />
                    </button>
                  ) : null}
                  <span
                    aria-hidden
                    className="size-7 flex-none rounded-full border"
                    style={{ backgroundColor: value }}
                  />
                  <HueSlider
                    hue={activeHue}
                    onChange={(next) => {
                      setHue(next)
                      // Grey and black have no hue to rotate, and two of the
                      // three colours this app starts a widget with are pure
                      // grey — a slider that visibly does nothing on them reads
                      // as broken. Waking the colour up is undone by one drag
                      // in the square above; nothing happening is not.
                      emit(hsvToRgb(next, hsv.s === 0 ? 1 : hsv.s, hsv.v === 0 ? 1 : hsv.v))
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {CHANNELS.map((channel) => (
                    <input
                      key={channel}
                      type="number"
                      min={0}
                      max={255}
                      aria-label={channel.toUpperCase()}
                      className="h-7 w-full min-w-0 rounded-md border bg-background px-1 text-center text-foreground"
                      value={rgb[channel]}
                      onChange={(event) => {
                        const level = Number(event.target.value)
                        if (!Number.isFinite(level)) return
                        emit({ ...rgb, [channel]: clamp(Math.round(level), 0, 255) })
                      }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
                  {CHANNELS.map((channel) => (
                    <span key={channel}>{channel.toUpperCase()}</span>
                  ))}
                </div>
                <DashboardPalette current={value} onPick={onChange} />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

const CHANNELS = ['r', 'g', 'b'] as const

/**
 * The colours the document already uses, in the picker rather than under the
 * field. Reaching one is a click on the surface being edited, and the grid is
 * the same list the dashboard is actually painted from.
 */
function DashboardPalette({
  current,
  onPick
}: {
  current: string
  onPick: (color: RgbColor) => void
}): React.JSX.Element | null {
  const palette = dashboardPalette(useDeviceStore((state) => state.draft))
  if (palette.length === 0) return null
  return (
    <div className="space-y-1 border-t pt-2">
      <span className="block text-[10px] text-muted-foreground">On this dashboard</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Colors already on the dashboard">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            // The hex is the whole label: a swatch names itself by the colour it
            // shows, and a screen reader has nothing else to go on.
            title={color}
            aria-label={color}
            aria-pressed={color.toUpperCase() === current.toUpperCase()}
            className={`size-5 rounded border ${color.toUpperCase() === current.toUpperCase() ? 'ring-1 ring-sky-400' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  )
}
