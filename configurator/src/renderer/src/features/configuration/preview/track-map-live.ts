import {
  OutlineAssembler,
  TRACK_MAP_CAR_BINDINGS,
  TRACK_MAP_OUTLINE_BINDING,
  type TrackMapCar,
  type TrackOutline,
  decodeCars
} from '@shared/track-map-codec'
import type { PreviewValues } from './preview-values'
import { SAMPLE_TRACK_CARS, SAMPLE_TRACK_OUTLINE } from './track-map-sample'

export interface TrackMapData {
  outline: TrackOutline | undefined
  cars: readonly TrackMapCar[]
}

const liveOutline = new OutlineAssembler()

function liveText(values: PreviewValues, binding: string): string | undefined {
  const value = values.read(binding)
  return value.available && value.text ? value.text : undefined
}

export function trackMapData(values: PreviewValues): TrackMapData {
  if (!values.started()) return { outline: SAMPLE_TRACK_OUTLINE, cars: SAMPLE_TRACK_CARS }
  const piece = liveText(values, TRACK_MAP_OUTLINE_BINDING)
  if (piece !== undefined) liveOutline.feed(piece)
  return {
    outline: liveOutline.outline(),
    cars: TRACK_MAP_CAR_BINDINGS.flatMap((binding) => decodeCars(liveText(values, binding) ?? ''))
  }
}
