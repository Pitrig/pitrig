import type { ScreenConfiguration } from '@shared/configuration-schema'

export function screenName(screens: readonly ScreenConfiguration[], index: number): string {
  return screens[index]?.id ?? `screen${index + 1}`
}
