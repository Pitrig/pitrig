import { dialog, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  DEFAULT_CONFIGURATION_FILE_NAME,
  type ConfigurationFileLoadValue,
  type ConfigurationFileResult,
  type ConfigurationFileSaveValue
} from '../../shared/configuration-files'
import { MAXIMUM_CONFIGURATION_TEXT_SIZE } from '../../shared/configuration-documents'
import type { DeviceConfiguration } from '../../shared/device'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import type { RecentConfigurations } from '../configs/recent-configurations'
import { writeFileAtomic } from '../write-file-atomic'
import { t } from '@shared/ui-text'

export class ConfigurationFileService {
  constructor(private readonly recent: RecentConfigurations) {}

  async load(owner?: BrowserWindow): Promise<ConfigurationFileResult<ConfigurationFileLoadValue | null>> {
    const options: OpenDialogOptions = {
      title: t('configs.dialog.loadTitle'),
      buttonLabel: t('configs.configurationFileService.loadConfiguration'),
      properties: ['openFile'],
      filters: [{ name: t('configs.dialog.filter'), extensions: ['json'] }]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return { ok: true, value: null }
    const path = result.filePaths[0]
    if (!path) return { ok: true, value: null }

    let json: string
    try {
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > MAXIMUM_CONFIGURATION_TEXT_SIZE) {
        return failure(
          'invalid_configuration',
          t('configs.configurationFileService.configurationFileMustNotExceed', { mAXIMUM_CONFIGURATION_TEXT_SIZE: MAXIMUM_CONFIGURATION_TEXT_SIZE })
        )
      }
      json = await readFile(path, 'utf8')
    } catch (error) {
      return failure(
        'read_failed',
        error instanceof Error ? error.message : t('configs.configurationFileService.failedToLoadTheConfiguration')
      )
    }

    let configuration: DeviceConfiguration
    try {
      configuration = parseDeviceConfigurationJson(json)
    } catch (error) {
      return failure(
        'invalid_configuration',
        error instanceof Error ? error.message : t('configs.configurationFileService.invalidConfigurationJson')
      )
    }
    await this.recent.record(path)
    return { ok: true, value: { configuration, fileName: basename(path) } }
  }

  async save(
    json: string,
    owner?: BrowserWindow
  ): Promise<ConfigurationFileResult<ConfigurationFileSaveValue>> {
    let content: string
    try {
      const configuration = parseDeviceConfigurationJson(json)
      content = `${JSON.stringify(configuration, null, 2)}\n`
    } catch (error) {
      return failure(
        'invalid_configuration',
        error instanceof Error ? error.message : t('configs.configurationFileService.invalidConfigurationJson')
      )
    }

    const options: SaveDialogOptions = {
      title: t('configs.dialog.saveTitle'),
      buttonLabel: t('configs.configurationFileService.saveConfiguration'),
      defaultPath: DEFAULT_CONFIGURATION_FILE_NAME,
      filters: [{ name: t('configs.dialog.filter'), extensions: ['json'] }]
    }
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { ok: true, value: { saved: false } }
    }
    try {
      await writeFileAtomic(result.filePath, content)
      await this.recent.record(result.filePath)
      return {
        ok: true,
        value: { saved: true, fileName: basename(result.filePath) }
      }
    } catch (error) {
      return failure(
        'write_failed',
        error instanceof Error ? error.message : t('configs.configurationFileService.failedToSaveTheConfiguration')
      )
    }
  }
}

function failure(
  code: 'invalid_configuration' | 'read_failed' | 'write_failed',
  message: string
): ConfigurationFileResult<never> {
  return { ok: false, error: { code, message } }
}
