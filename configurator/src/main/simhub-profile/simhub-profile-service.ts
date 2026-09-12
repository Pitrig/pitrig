import { dialog, type BrowserWindow, type SaveDialogOptions } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  generateSimHubProfile,
  SIMHUB_PROFILE_FILE_NAME,
  type SimHubProfileExportRequest,
  type SimHubProfileExportValue,
  type SimHubProfileResult
} from '../../shared/simhub-profile'
import { t } from '@shared/ui-text'

export class SimHubProfileService {
  async export(
    request: SimHubProfileExportRequest,
    owner?: BrowserWindow
  ): Promise<SimHubProfileResult<SimHubProfileExportValue>> {
    let content: string
    try {
      content = generateSimHubProfile(request.fieldNames, request.baudRate)
    } catch (error) {
      return failure(
        'invalid_request',
        error instanceof Error ? error.message : 'Invalid SimHub profile request.'
      )
    }

    const options: SaveDialogOptions = {
      title: t('protocol.dialog.saveTitle'),
      buttonLabel: t('protocol.dialog.buttonLabel'),
      defaultPath: SIMHUB_PROFILE_FILE_NAME,
      filters: [{ name: t('protocol.dialog.filter'), extensions: ['shsds'] }]
    }
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { ok: true, value: { saved: false } }
    }

    try {
      await writeFile(result.filePath, content, 'utf8')
      return {
        ok: true,
        value: { saved: true, fileName: basename(result.filePath) }
      }
    } catch (error) {
      return failure(
        'write_failed',
        error instanceof Error ? error.message : 'Failed to save the SimHub profile.'
      )
    }
  }
}

function failure(
  code: 'invalid_request' | 'write_failed',
  message: string
): SimHubProfileResult<never> {
  return { ok: false, error: { code, message } }
}
