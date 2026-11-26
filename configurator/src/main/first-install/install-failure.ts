import type { FirstInstallErrorCode } from '../../shared/first-install'

export type FailureDetails = Readonly<Record<string, string | number>>

export class InstallFailure extends Error {
  constructor(
    readonly code: FirstInstallErrorCode,
    readonly details: FailureDetails = {}
  ) {
    super(code)
  }
}

export function hex(value: number): string {
  return `0x${value.toString(16).padStart(6, '0')}`
}
