import { dialog, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  DEFAULT_CONFIGURATION_FILE_NAME,
  type ConfigurationFileLoadValue,
  type ConfigurationFileResult,
  type ConfigurationFileSaveValue
} from '../../shared/configuration-files'
import { MAXIMUM_CONFIGURATION_TEXT_SIZE } from '../../shared/configuration-documents'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import type { RecentConfigurations } from '../configs/recent-configurations'

export class ConfigurationFileService {
  constructor(private readonly recent: RecentConfigurations) {}

  async load(owner?: BrowserWindow): Promise<ConfigurationFileResult<ConfigurationFileLoadValue | null>> {
    const options: OpenDialogOptions = {
      title: 'Load SimCore configuration',
      buttonLabel: 'Load configuration',
      properties: ['openFile'],
      filters: [{ name: 'SimCore configuration', extensions: ['json'] }]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return { ok: true, value: null }
    const path = result.filePaths[0]
    if (!path) return { ok: true, value: null }

    try {
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > MAXIMUM_CONFIGURATION_TEXT_SIZE) {
        return failure(
          'invalid_configuration',
          `Configuration file must not exceed ${MAXIMUM_CONFIGURATION_TEXT_SIZE} bytes.`
        )
      }
      const json = await readFile(path, 'utf8')
      const configuration = parseDeviceConfigurationJson(json)
      await this.recent.record(path)
      return { ok: true, value: { configuration, fileName: basename(path) } }
    } catch (error) {
      return failure(
        isConfigurationError(error) ? 'invalid_configuration' : 'read_failed',
        error instanceof Error ? error.message : 'Failed to load the configuration file.'
      )
    }
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
        error instanceof Error ? error.message : 'Invalid configuration JSON.'
      )
    }

    const options: SaveDialogOptions = {
      title: 'Save SimCore configuration',
      buttonLabel: 'Save configuration',
      defaultPath: DEFAULT_CONFIGURATION_FILE_NAME,
      filters: [{ name: 'SimCore configuration', extensions: ['json'] }]
    }
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { ok: true, value: { saved: false } }
    }
    try {
      await writeFile(result.filePath, content, 'utf8')
      await this.recent.record(result.filePath)
      return {
        ok: true,
        value: { saved: true, fileName: basename(result.filePath) }
      }
    } catch (error) {
      return failure(
        'write_failed',
        error instanceof Error ? error.message : 'Failed to save the configuration file.'
      )
    }
  }
}

function isConfigurationError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Configuration')
}

function failure(
  code: 'invalid_configuration' | 'read_failed' | 'write_failed',
  message: string
): ConfigurationFileResult<never> {
  return { ok: false, error: { code, message } }
}
