import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HueSlider, SaturationSquare } from './color-picker-controls'
import { parseHex, rgbToHsv, hsvToRgb, toHex, clamp, type Channels } from './color-math'
import { Pipette } from 'lucide-react'
import type { RgbColor } from '@shared/configuration-schema'
import { dashboardPalette } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { t } from '@shared/ui-text'

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
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    place()
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
        aria-label={t('inspector.colorPicker.labelPicker', { label: label })}
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
              aria-label={t('inspector.colorPicker.labelPicker', { label: label })}
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
                      aria-label={t('inspector.colorPicker.pickAColourFromThe')}
                      title={t('inspector.colorPicker.pickAColourFromThe')}
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
      <span className="block text-[10px] text-muted-foreground">{t('inspector.colorPicker.onThisDashboard')}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('inspector.colorPicker.colorsAlreadyOnTheDashboard')}>
        {palette.map((color) => (
          <button
            key={color}
            type="button"
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
