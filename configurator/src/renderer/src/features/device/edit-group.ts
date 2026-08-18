import { useDeviceStore } from './device-store'

/**
 * Runs `work` as a single undo entry.
 *
 * Deleting four widgets is one edit to the person doing it, so the commits it
 * produces are collapsed into one history entry. The group closes even if
 * `work` throws: an unmatched `beginEdit` does not fail loudly, it silently
 * folds every later edit into the same entry for the rest of the session.
 *
 * Interactions that span events — a drag, a held arrow key, typing in a field —
 * cannot use this. They open on their first edit and close on an event that
 * may never come, so each owns the latch that decides whether it is open.
 */
export function withEditGroup<T>(work: () => T): T {
  const { beginEdit, endEdit } = useDeviceStore.getState()
  beginEdit()
  try {
    return work()
  } finally {
    endEdit()
  }
}
