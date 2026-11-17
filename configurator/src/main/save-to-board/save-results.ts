import type { SaveToBoardError, SaveToBoardResult } from '../../shared/save-to-board'

export type RestartOutcome =
  | { ok: true }
  | { ok: false; rebooted: boolean; error: SaveToBoardResult }

export type SaveStep<T> = { ok: true; value: T } | { ok: false; result: SaveToBoardResult }

export function saveFailure(code: SaveToBoardError['code'], message: string): SaveToBoardResult {
  return { ok: false, error: { code, message } }
}

export function stepFailure<T>(code: SaveToBoardError['code'], message: string): SaveStep<T> {
  return { ok: false, result: saveFailure(code, message) }
}

export function withMessage(result: SaveToBoardResult, message: string): SaveToBoardResult {
  return result.ok ? result : { ok: false, error: { ...result.error, message } }
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
