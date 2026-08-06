import { useMemo, useRef, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import type {
  DeviceConfiguration,
  DisplayDescriptor,
  FontSpec
} from '../../../../shared/device'
import {
  completePlacement,
  addEmptyTextWidget,
  deleteWidget,
  MAXIMUM_TEXT_WIDGETS,
  mutateSelectedWidget,
  type DeltaTimeWidgetConfiguration,
  type TextWidgetConfiguration,
  useDashboardEditorStore,
  type WidgetSelection
} from './dashboard-editor'

const SCREEN_BACKGROUND = '#000000'
const DEFAULT_TEXT_COLOR = '#E8E8E8'
const DEFAULT_BORDER_COLOR = '#AEAEAE'

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draftJson = useDeviceStore((state) => state.draftConfigurationJson)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const configuration = useMemo(
    () => parsePreviewConfiguration(draftJson) ?? pendingConfiguration ?? session?.configuration,
    [draftJson, pendingConfiguration, session?.configuration]
  )
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const [addOpen, setAddOpen] = useState(false)
  const textWidgetCount = configuration?.dashboard?.widgets?.text?.length ?? 0
  const selectedExists = selection?.type === 'delta_time'
    ? Boolean(configuration?.dashboard?.widgets?.delta_time)
    : selection?.type === 'text'
      ? Boolean(configuration?.dashboard?.widgets?.text?.[selection.index])
      : false
  const displayRatio = session
    ? session.info.display.width / session.info.display.height
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
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => setAddOpen(true)}>Add</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} onClick={() => {
              if (!selection || !window.confirm('Are you sure you want to delete the selected widget?')) return
              if (deleteWidget(selection)) select(undefined)
            }}>Delete</Button>
          </div>
        </div>
        <CardDescription>
          {session
            ? `${session.info.display.width} × ${session.info.display.height} logical pixels`
            : 'Connect a board to preview its dashboard configuration.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-4">
        <div
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-md border bg-black shadow-2xl"
          style={{
            maxWidth: surfaceMaximumWidth,
            aspectRatio: session
              ? `${session.info.display.width} / ${session.info.display.height}`
              : '16 / 9'
          }}
        >
          {session && configuration ? (
            <Widgets configuration={configuration} display={session.info.display} />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-zinc-600">
              No device connected
            </div>
          )}
        </div>
      </CardContent>
      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onPointerDown={() => setAddOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-semibold">Add widget</h2>
            <p className="mt-1 text-xs text-muted-foreground">Choose the widget type to add.</p>
            <div className="mt-4 space-y-2">
              <Button className="w-full justify-start" variant="outline" disabled={textWidgetCount >= MAXIMUM_TEXT_WIDGETS} onClick={() => {
                if (!session) return
                const added = addEmptyTextWidget(session.info.display)
                if (added) select(added)
                setAddOpen(false)
              }}>Text</Button>
              {textWidgetCount >= MAXIMUM_TEXT_WIDGETS ? <p className="text-[11px] text-amber-400">Maximum of {MAXIMUM_TEXT_WIDGETS} text widgets reached.</p> : null}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
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
  const widgets = configuration.dashboard?.widgets
  const screenBackground = configuration.dashboard?.background_color ?? SCREEN_BACKGROUND
  const textWidgets = (Array.isArray(widgets?.text) ? widgets.text : []).filter(
    (widget): widget is TextWidgetConfiguration => isRecord(widget)
  )

  const selectedPlacement = selection?.type === 'delta_time'
    ? completePlacement(widgets?.delta_time?.placement)
    : selection?.type === 'text'
      ? completePlacement(textWidgets[selection.index]?.placement)
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

  const moveInteraction = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!interaction || event.pointerId !== interaction.pointerId) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    const dx = point.x - interaction.start.x
    const dy = point.y - interaction.start.y
    const placement = transformedPlacement(interaction, dx, dy, display)
    mutateSelectedWidget(interaction.target, (widget) => { widget.placement = placement })
  }

  const finishInteraction = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (interaction?.pointerId !== event.pointerId) return
    svgRef.current?.releasePointerCapture(event.pointerId)
    setInteraction(undefined)
  }

  const layers: PreviewLayer[] = []
  if (widgets?.delta_time) {
    layers.push({
      type: 'delta_time',
      configuration: widgets.delta_time,
      zIndex: widgets.delta_time.z_index ?? 0,
      configurationOrder: 0
    })
  }
  textWidgets.forEach((widget, index) => layers.push({
    type: 'text',
    configuration: widget,
    index,
    zIndex: widget.z_index ?? 0,
    configurationOrder: index + 1
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
      {layers.map((layer) => layer.type === 'delta_time' ? (
        <g key="delta_time" onPointerDown={(event) => {
          const placement = completePlacement(layer.configuration.placement)
          if (placement) beginInteraction(event, { type: 'delta_time' }, 'move', placement)
        }}>
          <DeltaTimePreview configuration={layer.configuration} module={configuration.delta_time} />
          <HitArea placement={completePlacement(layer.configuration.placement)} />
        </g>
      ) : (
        <g key={`text-${layer.index}`} onPointerDown={(event) => {
          const placement = completePlacement(layer.configuration.placement)
          if (placement) beginInteraction(event, { type: 'text', index: layer.index }, 'move', placement)
        }}>
          <TextWidgetPreview configuration={layer.configuration} />
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

type PreviewLayer =
  | { type: 'delta_time'; configuration: DeltaTimeWidgetConfiguration; zIndex: number; configurationOrder: number }
  | { type: 'text'; configuration: TextWidgetConfiguration; index: number; zIndex: number; configurationOrder: number }

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
          x={placement.x}
          y={placement.y}
          width={placement.width}
          height={placement.height}
          rx={borderRadius}
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
          fill={backgroundColor === 'transparent' ? SCREEN_BACKGROUND : backgroundColor}
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

function formattedPreviewValue(configuration: TextWidgetConfiguration): string {
  const prefix = configuration.transform?.prefix ?? ''
  const suffix = configuration.transform?.suffix ?? ''
  switch (configuration.transform?.format ?? 'source_text') {
    case 'duration_ms':
      return `${prefix}00:00.000${suffix}`
    case 'signed_duration_ms':
      return `${prefix}+0.000${suffix}`
    case 'source_text':
      return configuration.value?.unavailable_text ?? '--'
  }
}

function DeltaTimePreview({
  configuration,
  module
}: {
  configuration: DeltaTimeWidgetConfiguration
  module: DeviceConfiguration['delta_time']
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  const unavailableBehavior = module?.unavailable_behavior ?? 'hide'
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

function parsePreviewConfiguration(json: string): DeviceConfiguration | undefined {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as DeviceConfiguration)
      : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
