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
  // A sheet is cached as one tall strip. There are no live values on the canvas,
  // so a frame chosen from telemetry has no reading to resolve — the first frame
  // is what the board would draw before one arrived, and it is what shows here.
  const frames = bitmap.frameCount
  const frame =
    frames > 1 && !configuration.sprite_frame_source
      ? Math.min(frames - 1, Math.max(0, configuration.sprite_frame ?? 0))
      : 0
  // The <image> is drawn strip-tall and slid up, with a clip cutting it back to
  // the one frame: SVG has no source rectangle, so this is what a window is.
  const strip = { height: bitmap.height * frames, offset: -frame * bitmap.height }
  // A recolour mixes the bitmap towards one colour without touching its alpha,
  // so it is the same pixels flooded and laid back over at the configured
  // strength.
  const recolored = tint !== undefined && tint !== 'transparent'
  const recolorOpacity = (configuration.recolor_opa ?? 255) / 255
  // An alpha8 bitmap carries coverage and no colour: the board floods it with
  // the recolour outright — white when none is authored — and `recolor_opa`
  // has no pixels of its own to scale against, so it does not apply. The cache
  // holds that coverage as white, which is why the unrecoloured case needs no
  // flood of its own.
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

// A caption belongs to the frame, so it is drawn the same way for every type
// that has one: anchored to an edge of the widget's outer box, and over a gap in
// whichever border line it ends up crossing.
