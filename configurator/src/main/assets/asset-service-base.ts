import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'

import type { AssetError, AssetResult } from '@shared/asset-upload'
import type { DeviceService } from '../device/device-service'

// One selected file on disk, before anything has been built from it.
export interface SourceRecord {
  id: string
  name: string
  path: string
}

// What differs between the two uploaded asset kinds, as data. Everything else
// about selecting a source, holding the operation and refusing an upload the
// device cannot take is the same for both — and was written twice, which is how
// they came to disagree about cancelling and about clearing the operation.
export interface AssetKind {
  /** Which part of the device session reports on this kind. */
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

// The parts of an upload service that do not depend on what is being uploaded.
export abstract class AssetServiceBase {
  protected readonly sources = new Map<string, SourceRecord>()
  protected activeOperation: AbortController | undefined

  protected constructor(
    protected readonly deviceService: DeviceService,
    protected readonly kind: AssetKind
  ) {}

  /** Opens the file dialog and registers what was chosen. */
  protected async chooseSource(
    owner?: BrowserWindow
  ): Promise<AssetResult<SourceRecord | null>> {
    const options: OpenDialogOptions = {
      title: this.kind.dialogTitle,
      buttonLabel: this.kind.dialogButton,
      properties: ['openFile'],
      filters: this.kind.filters
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return success(null)
    const path = result.filePaths[0]
    if (!path || !this.kind.extensions.includes(extname(path).toLowerCase())) {
      return failure('invalid_request', this.kind.wrongExtension)
    }
    return success({ id: randomUUID(), name: basename(path), path })
  }

  /**
   * Everything that has to hold before an upload starts, in the order a user
   * can act on: not already running, firmware that supports this kind, storage
   * present, and no package waiting for a reboot.
   */
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

  /** Aborts an upload in flight, if there is one. Safe to call at any time. */
  cancel(): AssetResult<void> {
    this.activeOperation?.abort()
    return success(undefined)
  }

  /**
   * Releases the operation only when it is still ours: a cancelled upload that
   * was restarted has already handed the slot to its replacement.
   */
  protected release(operation: AbortController): void {
    if (this.activeOperation === operation) this.activeOperation = undefined
  }
}
