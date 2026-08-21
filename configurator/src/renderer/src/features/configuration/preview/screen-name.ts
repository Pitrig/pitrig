import type { ScreenConfiguration } from '@shared/configuration-schema'

/**
 * What a screen is called. The name is the document's own — it is what a
 * `goto_screen` action points at — and a sparse screen that has not been given
 * one yet is called what `ensureScreen` will name it, so the strip never shows
 * a screen under one name and the inspector under another.
 */
export function screenName(screens: readonly ScreenConfiguration[], index: number): string {
  return screens[index]?.id ?? `screen${index + 1}`
}

/**
 * Which screen is being authored, and in which order the driver swipes through
 * them. Which one is being looked at is an editor view with nothing to save;
 * the order is the document, so dragging a tab is an ordinary undoable edit.
 *
 * The tabs carry names rather than positions. A number tells the author nothing
 * about which screen it is, and it is the one label that changes meaning as a
 * tab is dragged — during a reorder every number after the drop point is about
 * to become a different screen, which is exactly when the strip has to be
 * readable. A name travels with the screen, so what is picked up is what lands.
 */
