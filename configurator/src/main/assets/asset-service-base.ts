import type { BrowserWindow, OpenDialogOptions } from 'electron'

import type { AssetError, AssetResult } from '@shared/asset-upload'
import { chooseFile } from './choose-file'
import type { DeviceService } from '../device/device-service'

export interface SourceRecord {
  id: string
  name: string
  path: string
}

export interface AssetKind {
  readonly sessionKey: 'fontAssets' | 'imageAssets' | 'firmware'
  readonly dialogTitle: string
  readonly dialogButton: string
  readonly filters: OpenDialogOptions['filters']
  readonly extensions: readonly string[]
  readonly wrongExtension: string
  readonly busy: string
  readonly unsupported: string
  readonly storageUnavailable: string
  readonly rebootRequired: string
}

export function success<T>(value: T): AssetResult<T> {
  return { ok: true, value }
}

export function failure<T>(code: AssetError['code'], message: string): AssetResult<T> {
  return { ok: false, error: { code, message } }
}

export class PackageTooLargeError extends Error {}

export abstract class AssetServiceBase {
  protected readonly sources = new Map<string, SourceRecord>()
  protected activeOperation: AbortController | undefined

  protected constructor(
    protected readonly deviceService: DeviceService,
    protected readonly kind: AssetKind
  ) {}

  protected async chooseSource(
    owner?: BrowserWindow
  ): Promise<AssetResult<SourceRecord | null>> {
    const outcome = await chooseFile(
      {
        title: this.kind.dialogTitle,
        buttonLabel: this.kind.dialogButton,
        filters: this.kind.filters,
        extensions: this.kind.extensions
      },
      owner
    )
    if (outcome.kind === 'cancelled') return success(null)
    if (outcome.kind === 'wrong_extension') {
      return failure('invalid_request', this.kind.wrongExtension)
    }
    return success(outcome.file)
  }

  protected preflight(): AssetResult<void> | undefined {
    if (this.activeOperation) return failure('busy', this.kind.busy)
    const state = this.deviceService.getState().session?.[this.kind.sessionKey]
    if (!state) return failure('unsupported_firmware', this.kind.unsupported)
    if (!state.storageAvailable) {
      return failure('device_error', this.kind.storageUnavailable)
    }
    if (state.rebootRequired) {
      return failure('device_error', this.kind.rebootRequired)
    }
    return undefined
  }

  cancel(): AssetResult<void> {
    this.activeOperation?.abort()
    return success(undefined)
  }

  protected release(operation: AbortController): void {
    if (this.activeOperation === operation) this.activeOperation = undefined
  }
}
