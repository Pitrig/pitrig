import { useId } from 'react'
import { type ImageWidgetConfiguration } from '@shared/configuration-schema'
import { completePlacement } from '../dashboard-editor'
import { usePreviewAssetStore } from './preview-assets'
import { markupId } from './canvas-geometry'
import { contentArea } from './preview-geometry-paint'
import { DEFAULT_BORDER_COLOR, DEFAULT_TEXT_COLOR } from './preview-theme'
import { type PreviewValues, lvglCenterOffset, normalizeColor } from './preview-values'
import { WidgetFrameShape } from './frame-shape'

export function ImagePreview({
  configuration,
  values
}: {
  configuration: ImageWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const recolorId = markupId(useId())
  const bitmap = usePreviewAssetStore((state) =>
    configuration.image ? state.images[configuration.image] : undefined
  )
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.recolor,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const tint = normalizeColor(style.color)
  if (!bitmap) {
    return (
      <g>
        <rect
          x={placement.x}
          y={placement.y}
          width={placement.width}
          height={placement.height}
          rx={configuration.border?.radius_px ?? 0}
          fill={tint && tint !== 'transparent' ? tint : '#334155'}
          fillOpacity={tint && tint !== 'transparent' ? 0.5 : 0.35}
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeOpacity={0.6}
          strokeDasharray="4 3"
          strokeWidth={configuration.border?.width_px || 1}
        />
        <text
          x={placement.x + placement.width / 2}
          y={placement.y + placement.height / 2}
          fill={DEFAULT_TEXT_COLOR}
          fontFamily="Arial, sans-serif"
          fontSize={Math.max(8, Math.min(placement.height / 4, 14))}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {configuration.image || 'no image'}
        </text>
      </g>
    )
  }
  const content = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const x = content.x + lvglCenterOffset(content.width, bitmap.width)
  const y = content.y + lvglCenterOffset(content.height, bitmap.height)
  const frames = bitmap.frameCount
  const frame =
    frames > 1 && !configuration.sprite_frame_source
      ? Math.min(frames - 1, Math.max(0, configuration.sprite_frame ?? 0))
      : 0
  const strip = { height: bitmap.height * frames, offset: -frame * bitmap.height }
  const recolored = tint !== undefined && tint !== 'transparent'
  const recolorOpacity = (configuration.recolor_opa ?? 255) / 255
  const alphaOnly = bitmap.format === 'alpha8'
  const frameClipId = markupId(`${recolorId}-frame`)
  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <clipPath id={frameClipId}>
        <rect x={x} y={y} width={bitmap.width} height={bitmap.height} />
      </clipPath>
      <g clipPath={`url(#${frameClipId})`}>
        {alphaOnly ? null : (
          <image
            href={bitmap.dataUrl}
            x={x}
            y={y + strip.offset}
            width={bitmap.width}
            height={strip.height}
          />
        )}
        {alphaOnly || recolored ? (
          <>
            <filter id={recolorId}>
              <feFlood floodColor={recolored ? tint : '#ffffff'} result="flood" />
              <feComposite in="flood" in2="SourceAlpha" operator="in" />
            </filter>
            <image
              href={bitmap.dataUrl}
              x={x}
              y={y + strip.offset}
              width={bitmap.width}
              height={strip.height}
              filter={`url(#${recolorId})`}
              opacity={alphaOnly ? 1 : recolorOpacity}
            />
          </>
        ) : null}
      </g>
    </g>
  )
}
