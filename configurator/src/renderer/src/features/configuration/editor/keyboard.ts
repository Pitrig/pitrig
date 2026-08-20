/**
 * Whether a keystroke was aimed at something being typed into.
 *
 * Every window-level shortcut in the app has to ask this: the canvas is an SVG
 * that nothing focuses, so the listeners are on the window and would otherwise
 * eat a `Cmd+S` typed while renaming a widget or a `Delete` in a text field.
 * One implementation rather than one per listener, because two of them drifting
 * apart is a shortcut that fires in a field on some panels and not on others.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
