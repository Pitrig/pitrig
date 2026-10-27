import type { LedEffect, LedPart, LedPartLayout } from '@shared/configuration-schema'
import { coversWhole } from '@shared/led-parts'

export function applyParts(effect: LedEffect, parts: LedPart[] | undefined, lamps: number): void {
  if (!parts || parts.length === 0 || coversWhole(parts, lamps)) delete effect.parts
  else effect.parts = parts
  if ((effect.parts ?? []).length < 2) delete effect.layout
}

export function applyLayout(effect: LedEffect, layout: LedPartLayout): void {
  if (layout === 'joined') delete effect.layout
  else effect.layout = layout
}
