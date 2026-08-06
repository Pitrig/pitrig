import { useMemo } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import type {
  DeviceConfiguration,
  DisplayDescriptor,
  FontSpec,
  Placement
} from '../../../../shared/device'

type DashboardWidgets = NonNullable<NonNullable<DeviceConfiguration['dashboard']>['widgets']>
type TextWidgetConfiguration = NonNullable<DashboardWidgets['text']>[number]
type DeltaTimeWidgetConfiguration = NonNullable<DashboardWidgets['delta_time']>

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
  const displayRatio = session
    ? session.info.display.width / session.info.display.height
    : 16 / 9
  const surfaceMaximumWidth = session
    ? `min(42rem, max(8rem, calc((100vh - 15rem) * ${displayRatio})))`
    : 'min(42rem, max(8rem, calc(100vw - 32rem)))'

  return (
    <Card
      className="w-full bg-background/70"
      style={{ maxWidth: `calc(${surfaceMaximumWidth} + 2rem)` }}
    >
      <CardHeader className="text-center">
        <CardTitle>Display preview</CardTitle>
        <CardDescription>
          {session
            ? `${session.info.display.width} × ${session.info.display.height} logical pixels`
            : 'Connect a board to preview its dashboard configuration.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="relative mx-auto w-full overflow-hidden rounded-md border bg-black shadow-2xl"
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
  const widgets = configuration.dashboard?.widgets
  const textWidgets = (Array.isArray(widgets?.text) ? widgets.text : []).filter(
    (widget): widget is TextWidgetConfiguration => isRecord(widget)
  )

  return (
    <svg
      aria-label="Dashboard display preview"
      className="block size-full"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`0 0 ${display.width} ${display.height}`}
    >
      <rect width={display.width} height={display.height} fill={SCREEN_BACKGROUND} />
      {widgets?.delta_time ? (
        <DeltaTimePreview
          configuration={widgets.delta_time}
          module={configuration.delta_time}
        />
      ) : null}
      {textWidgets.map((widget, index) => (
        <TextWidgetPreview
          key={`${widget.binding ?? 'text'}-${index}`}
          configuration={widget}
        />
      ))}
    </svg>
  )
}

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

function completePlacement(placement: Placement | undefined): Required<Placement> | undefined {
  if (
    !placement ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.width) ||
    !Number.isFinite(placement.height) ||
    (placement.width ?? 0) <= 0 ||
    (placement.height ?? 0) <= 0
  ) {
    return undefined
  }
  return placement as Required<Placement>
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
