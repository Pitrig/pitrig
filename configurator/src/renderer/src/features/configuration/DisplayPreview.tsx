import { useEffect, useRef, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import { screensOf, widgetsOf } from '../../../../shared/configuration-access'
import type {
  BarWidgetConfiguration,
  DeltaTimeWidgetConfiguration,
  FontSpec,
  ShapeWidgetConfiguration,
  TextWidgetConfiguration,
  ValueTransform,
  WidgetConfiguration
} from '../../../../shared/configuration-schema'
import type { DeviceConfiguration, DisplayDescriptor } from '../../../../shared/device'
import { BOARD_PROFILES } from '../../../../shared/device'
import {
  activeScreen,
  addBarWidget,
  addDeltaTimeWidget,
  addShapeWidget,
  addTextWidget,
  completePlacement,
  DEFAULT_WIDGET_FONT_SIZE_PX,
  deleteWidget,
  findWidget,
  MAXIMUM_TEXT_WIDGETS,
  mutateSelectedWidget,
  useDashboardEditorStore,
  type WidgetSelection
} from './dashboard-editor'

const SCREEN_BACKGROUND = '#000000'
const DEFAULT_TEXT_COLOR = '#E8E8E8'
const DEFAULT_BORDER_COLOR = '#AEAEAE'

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const configuration = draft ?? pendingConfiguration ?? session?.configuration
  const display = configuration
    ? BOARD_PROFILES[configuration.board]?.display
    : session?.info.display
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  // Any size of an installed family renders, so a new widget starts at a
  // readable default rather than at whatever size happens to be installed.
  const installedFamily = session?.fontAssets?.families[0]
  const defaultFont = installedFamily
    ? { family: installedFamily, size_px: DEFAULT_WIDGET_FONT_SIZE_PX }
    : undefined
  const screenWidgets = widgetsOf(activeScreen(configuration))
  const textWidgetCount = screenWidgets.filter((widget) => widget.type === 'text').length
  const hasDeltaTimeWidget = screenWidgets.some((widget) => widget.type === 'delta_time')
  const selectedExists =
    selection?.type === 'widget' && Boolean(findWidget(configuration, selection.id))
  const displayRatio = display
    ? display.width / display.height
    : 16 / 9
  const surfaceMaximumWidth = `max(8rem, calc((100vh - 13rem) * ${displayRatio}))`

  return (
    <Card
      className="flex max-h-full w-full flex-col bg-background/70"
      style={{ maxWidth: `calc(${surfaceMaximumWidth} + 2rem)` }}
    >
      <CardHeader className="flex-none py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Display preview</CardTitle>
          <div className="flex gap-2">
            <Button className="h-8 w-20" variant="outline" disabled={!configuration || textWidgetCount >= MAXIMUM_TEXT_WIDGETS} title={textWidgetCount >= MAXIMUM_TEXT_WIDGETS ? `Maximum of ${MAXIMUM_TEXT_WIDGETS} text widgets reached.` : undefined} onClick={() => {
              if (!display) return
              const added = addTextWidget(display, defaultFont)
              if (added) select(added)
            }}>+ Text</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addShapeWidget(display)
              if (added) select(added)
            }}>+ Shape</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addBarWidget(display)
              if (added) select(added)
            }}>+ Bar</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration || hasDeltaTimeWidget} onClick={() => {
              if (!display) return
              const added = addDeltaTimeWidget(display, defaultFont)
              if (added) select(added)
            }}>+ Delta</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} onClick={() => {
              if (!selection || !window.confirm('Are you sure you want to delete the selected widget?')) return
              if (deleteWidget(selection)) select(undefined)
            }}>Delete</Button>
          </div>
        </div>
        <CardDescription>
          {display
            ? `${display.width} × ${display.height} logical pixels · ${configuration?.board ?? 'connected board'}`
            : 'Create, load, or connect a configuration to start editing.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-4">
        <div
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-md border bg-black shadow-2xl"
          style={{
            maxWidth: surfaceMaximumWidth,
            aspectRatio: display
              ? `${display.width} / ${display.height}`
              : '16 / 9'
          }}
        >
          {display && configuration ? (
            <Widgets configuration={configuration} display={display} />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-zinc-600">
              No local configuration
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Widgets({
  configuration,
  display
}: {
  configuration: DeviceConfiguration
  display: DisplayDescriptor
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const [interaction, setInteraction] = useState<Interaction>()
  const screen = screensOf(configuration)[0]
  const screenBackground = screen?.background_color ?? SCREEN_BACKGROUND
  const widgets = widgetsOf(screen)

  const selectedPlacement =
    selection?.type === 'widget'
      ? completePlacement(findWidget(configuration, selection.id)?.widget.placement)
      : undefined

  const beginInteraction = (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Required<NonNullable<TextWidgetConfiguration['placement']>>
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    select(target)
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    setInteraction({ pointerId: event.pointerId, target, mode, start: point, placement })
  }

  // A pointer stream can outpace the frame rate, and each commit rewrites the
  // whole document. Coalescing to one commit per frame keeps dragging smooth.
  const pendingFrame = useRef<number | undefined>(undefined)
  useEffect(() => () => {
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
  }, [])

  const moveInteraction = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!interaction || event.pointerId !== interaction.pointerId) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    const dx = point.x - interaction.start.x
    const dy = point.y - interaction.start.y
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = undefined
      const placement = transformedPlacement(interaction, dx, dy, display)
      mutateSelectedWidget(interaction.target, (widget) => { widget.placement = placement })
    })
  }

  const finishInteraction = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (interaction?.pointerId !== event.pointerId) return
    svgRef.current?.releasePointerCapture(event.pointerId)
    setInteraction(undefined)
  }

  // Same rule the firmware applies: z_index ascending, authored array order
  // breaking ties.
  const layers: PreviewLayer[] = widgets.map((widget, index) => ({
    configuration: widget,
    zIndex: widget.z_index ?? 0,
    configurationOrder: index
  }))
  layers.sort((left, right) =>
    left.zIndex - right.zIndex || left.configurationOrder - right.configurationOrder
  )

  return (
    <svg
      ref={svgRef}
      aria-label="Dashboard display preview"
      className="block size-full touch-none select-none"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`0 0 ${display.width} ${display.height}`}
      onPointerMove={moveInteraction}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onPointerDown={() => select({ type: 'screen' })}
    >
      <rect width={display.width} height={display.height} fill={screenBackground} />
      {layers.map((layer) => (
        <g key={layer.configuration.id ?? layer.configurationOrder} onPointerDown={(event) => {
          const placement = completePlacement(layer.configuration.placement)
          const id = layer.configuration.id
          if (placement && id) beginInteraction(event, { type: 'widget', id }, 'move', placement)
        }}>
          {layer.configuration.type === 'delta_time' ? (
            <DeltaTimePreview configuration={layer.configuration} module={configuration.delta_time} />
          ) : layer.configuration.type === 'bar' ? (
            <BarPreview configuration={layer.configuration} />
          ) : layer.configuration.type === 'shape' ? (
            <ShapePreview configuration={layer.configuration} />
          ) : (
            <TextWidgetPreview configuration={layer.configuration} />
          )}
          <HitArea placement={completePlacement(layer.configuration.placement)} />
        </g>
      ))}
      {selection && selectedPlacement ? (
        <SelectionFrame
          placement={selectedPlacement}
          onResize={(event, mode) => beginInteraction(event, selection, mode, selectedPlacement)}
        />
      ) : null}
    </svg>
  )
}

interface PreviewLayer {
  configuration: WidgetConfiguration
  zIndex: number
  configurationOrder: number
}

type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type InteractionMode = 'move' | ResizeMode
interface Interaction {
  pointerId: number
  target: WidgetSelection
  mode: InteractionMode
  start: { x: number; y: number }
  placement: Required<NonNullable<TextWidgetConfiguration['placement']>>
}

function HitArea({ placement }: { placement?: Required<NonNullable<TextWidgetConfiguration['placement']>> }): React.JSX.Element | null {
  return placement ? <rect {...placement} fill="transparent" className="cursor-move" /> : null
}

function SelectionFrame({ placement, onResize }: { placement: Required<NonNullable<TextWidgetConfiguration['placement']>>; onResize: (event: React.PointerEvent<SVGCircleElement>, mode: ResizeMode) => void }): React.JSX.Element {
  const points: Array<[ResizeMode, number, number]> = [
    ['nw', placement.x, placement.y], ['n', placement.x + placement.width / 2, placement.y],
    ['ne', placement.x + placement.width, placement.y], ['e', placement.x + placement.width, placement.y + placement.height / 2],
    ['se', placement.x + placement.width, placement.y + placement.height], ['s', placement.x + placement.width / 2, placement.y + placement.height],
    ['sw', placement.x, placement.y + placement.height], ['w', placement.x, placement.y + placement.height / 2]
  ]
  return <g aria-label="Selected widget bounds">
    <rect {...placement} fill="none" stroke="#38BDF8" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />
    {points.map(([mode, cx, cy]) => <circle key={mode} cx={cx} cy={cy} r={5} fill="#0EA5E9" stroke="#E0F2FE" strokeWidth={1.5} className="cursor-pointer" onPointerDown={(event) => onResize(event, mode)} />)}
  </g>
}

function logicalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | undefined {
  if (!svg) return undefined
  const matrix = svg.getScreenCTM()
  if (!matrix) return undefined
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function transformedPlacement(interaction: Interaction, dx: number, dy: number, display: DisplayDescriptor): Required<NonNullable<TextWidgetConfiguration['placement']>> {
  const original = interaction.placement
  if (interaction.mode === 'move') return {
    ...original,
    x: Math.round(clamp(original.x + dx, 0, display.width - original.width)),
    y: Math.round(clamp(original.y + dy, 0, display.height - original.height))
  }
  const minimum = 8
  let left = original.x
  let top = original.y
  let right = original.x + original.width
  let bottom = original.y + original.height
  if (interaction.mode.includes('w')) left = clamp(original.x + dx, 0, right - minimum)
  if (interaction.mode.includes('e')) right = clamp(original.x + original.width + dx, left + minimum, display.width)
  if (interaction.mode.includes('n')) top = clamp(original.y + dy, 0, bottom - minimum)
  if (interaction.mode.includes('s')) bottom = clamp(original.y + original.height + dy, top + minimum, display.height)
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) }
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }

function TextWidgetPreview({
  configuration
}: {
  configuration: TextWidgetConfiguration
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null

  const borderWidth = configuration.border?.width_px ?? 0
  const borderRadius = configuration.border?.radius_px ?? 0
  const backgroundColor = normalizeColor(configuration.background_color) ?? 'transparent'
  // An inset background leaves the frame clear, so it starts inside the border.
  const backgroundInset = configuration.background_inset_px ?? 0
  const backgroundEdge = backgroundInset > 0 ? borderWidth + backgroundInset : 0
  const title = configuration.title?.text ?? ''
  const titleFont = resolvedFont(configuration.title?.font, 10)
  const valueFont = resolvedFont(configuration.value?.font, 48)
  const padding = {
    left: configuration.padding?.left ?? 0,
    top: configuration.padding?.top ?? 0,
    right: configuration.padding?.right ?? 0,
    bottom: configuration.padding?.bottom ?? 0
  }
  const contentLeft = placement.x + borderWidth + padding.left
  const contentRight = placement.x + placement.width - borderWidth - padding.right
  const contentTop = placement.y + borderWidth + padding.top
  const contentBottom = placement.y + placement.height - borderWidth - padding.bottom
  const alignment = configuration.value?.alignment ?? 'center'
  const valueX = alignment === 'left'
    ? contentLeft
    : alignment === 'right'
      ? contentRight
      : (contentLeft + contentRight) / 2
  const valueAnchor = alignment === 'left' ? 'start' : alignment === 'right' ? 'end' : 'middle'
  const valueY = (contentTop + contentBottom) / 2 + (title ? titleFont.sizePx / 4 : 0)
  const titleWidth = estimateTextWidth(title, titleFont.sizePx)
  const previewValue = formattedPreviewValue(configuration)

  return (
    <g>
      {backgroundColor !== 'transparent' ? (
        <rect
          x={placement.x + backgroundEdge}
          y={placement.y + backgroundEdge}
          width={Math.max(0, placement.width - 2 * backgroundEdge)}
          height={Math.max(0, placement.height - 2 * backgroundEdge)}
          rx={Math.max(0, borderRadius - backgroundInset)}
          fill={backgroundColor}
        />
      ) : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          rx={Math.max(0, borderRadius - borderWidth / 2)}
          fill="none"
          stroke={configuration.border?.color ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
      {title && borderWidth > 0 ? (
        <rect
          x={placement.x + (placement.width - titleWidth - 8) / 2}
          y={placement.y}
          width={titleWidth + 8}
          height={borderWidth + 2}
          fill={backgroundColor === 'transparent' || backgroundInset > 0 ? SCREEN_BACKGROUND : backgroundColor}
        />
      ) : null}
      {title ? (
        <text
          x={placement.x + placement.width / 2}
          y={placement.y + (configuration.title?.offset_y_px ?? 0)}
          fill={configuration.title?.color ?? DEFAULT_TEXT_COLOR}
          fontFamily={titleFont.family}
          fontSize={titleFont.sizePx}
          fontWeight={titleFont.weight}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {title}
        </text>
      ) : null}
      <text
        x={valueX}
        y={valueY}
        fill={configuration.value?.color ?? DEFAULT_TEXT_COLOR}
        fontFamily={valueFont.family}
        fontSize={valueFont.sizePx}
        fontWeight={valueFont.weight}
        textAnchor={valueAnchor}
        dominantBaseline="middle"
      >
        {previewValue}
      </text>
    </g>
  )
}

// The configurator has no telemetry stream, so the honest preview is what the
// device renders while a value is unavailable. An explicit unavailable_text is
// that text; without one the device renders a zero through the widget's own
// transform, so the preview mirrors the same rule.
function formattedPreviewValue(configuration: TextWidgetConfiguration): string {
  const configured = configuration.value?.unavailable_text
  if (configured) return configured
  // No telemetry stream here, so the preview is what the device shows while
  // every source is still silent: each one's zero through its own transform.
  return (configuration.sources ?? [])
    .map(({ transform }) => `${transform?.prefix ?? ''}${zeroValue(transform)}${transform?.suffix ?? ''}`)
    .join('')
}

function zeroValue(transform: ValueTransform | undefined): string {
  if (transform?.type === 'time') {
    return transform.format === 'signed_duration_ms' ? '+0.000' : '00:00.000'
  }
  if (transform?.type === 'number') {
    const zero = 0 * (transform.scale ?? 1) + (transform.offset ?? 0)
    return zero.toFixed(transform.decimals ?? 0)
  }
  return '0'
}

// No telemetry here, so the bar draws its track with an empty fill, which is
// exactly what the device shows before the first value.
function BarPreview({
  configuration
}: {
  configuration: BarWidgetConfiguration
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const borderWidth = configuration.border?.width_px ?? 0
  const track = normalizeColor(configuration.background_color) ?? 'transparent'
  const radius = configuration.border?.radius_px ?? 0
  return (
    <g>
      {track !== 'transparent' ? (
        <rect
          x={placement.x}
          y={placement.y}
          width={placement.width}
          height={placement.height}
          rx={radius}
          fill={track}
        />
      ) : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          rx={Math.max(0, radius - borderWidth / 2)}
          fill="none"
          stroke={configuration.border?.color ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
    </g>
  )
}

function ShapePreview({
  configuration
}: {
  configuration: ShapeWidgetConfiguration
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const borderWidth = configuration.border?.width_px ?? 0
  const background = normalizeColor(configuration.background_color) ?? 'transparent'
  const inset = configuration.background_inset_px ?? 0
  const edge = inset > 0 ? borderWidth + inset : 0
  // An ellipse is a radius of half the shorter side, which is what the device
  // gets from LV_RADIUS_CIRCLE.
  const radius = configuration.kind === 'ellipse'
    ? Math.min(placement.width, placement.height) / 2
    : configuration.border?.radius_px ?? 0
  return (
    <g>
      {background !== 'transparent' ? (
        <rect
          x={placement.x + edge}
          y={placement.y + edge}
          width={Math.max(0, placement.width - 2 * edge)}
          height={Math.max(0, placement.height - 2 * edge)}
          rx={Math.max(0, radius - inset)}
          fill={background}
        />
      ) : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          rx={Math.max(0, radius - borderWidth / 2)}
          fill="none"
          stroke={configuration.border?.color ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
    </g>
  )
}

function DeltaTimePreview({
  configuration,
  module
}: {
  configuration: DeltaTimeWidgetConfiguration
  module: DeviceConfiguration['delta_time']
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  const unavailableBehavior = module?.unavailable_behavior ?? 'zero'
  if (!placement || unavailableBehavior === 'hide') return null

  const font = resolvedFont(configuration.font, 48)
  const scaleEnabled = module?.scale?.enabled ?? false
  const showSign = module?.scale?.show_sign ?? false
  const label = unavailableBehavior === 'zero'
    ? showSign ? '+0.00' : '0.00'
    : module?.placeholder ?? '---'
  const borderWidth = configuration.scale?.border_width_px ?? 2
  const verticalPadding = configuration.scale?.vertical_padding_px ?? 2
  const borderRadius = configuration.scale?.border_radius_px ?? 8
  const contentHeight = font.sizePx + 2 * verticalPadding
  const scaleHeight = contentHeight + 2 * borderWidth
  const scaleY = placement.y + (placement.height - scaleHeight) / 2
  const color = configuration.neutral_color ?? DEFAULT_TEXT_COLOR

  return (
    <g>
      {scaleEnabled ? (
        <>
          <rect
            x={placement.x + borderWidth / 2}
            y={scaleY + borderWidth / 2}
            width={placement.width - borderWidth}
            height={scaleHeight - borderWidth}
            rx={Math.max(0, borderRadius - borderWidth / 2)}
            fill="none"
            stroke={color}
            strokeWidth={borderWidth}
          />
          {[1, 3].map((numerator) => (
            <rect
              key={numerator}
              x={placement.x + placement.width * numerator / 4 - borderWidth / 2}
              y={scaleY + scaleHeight - borderWidth - Math.max(1, verticalPadding / 2)}
              width={borderWidth}
              height={Math.max(1, verticalPadding / 2)}
              fill={color}
            />
          ))}
        </>
      ) : null}
      <text
        x={placement.x + placement.width / 2}
        y={placement.y + placement.height / 2}
        fill={color}
        fontFamily={font.family}
        fontSize={font.sizePx}
        fontWeight={font.weight}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  )
}

function resolvedFont(
  font: FontSpec | undefined,
  defaultSizePx: number
): { family: string; sizePx: number; weight: number } {
  const identifier = font?.family ?? 'custom_font'
  const black = identifier.includes('black')
  return {
    family: identifier.startsWith('roboto')
      ? 'Roboto, Arial, sans-serif'
      : 'Arial, sans-serif',
    sizePx: font?.size_px ?? defaultSizePx,
    weight: black ? 900 : 600
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}

function normalizeColor(color: string | undefined): string | undefined {
  return color === '#00000000' ? 'transparent' : color
}


