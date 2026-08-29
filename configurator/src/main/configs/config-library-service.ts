import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { allWidgetsOf, screensOf } from '../../shared/configuration-access'
import {
  CONFIGURATION_ID_PATTERN,
  MAXIMUM_CONFIGURATION_NAME,
  MAXIMUM_SAVED_CONFIGURATIONS,
  configurationIdFor,
  type ConfigLibraryError,
  type ConfigLibraryResult,
  type ConfigurationLibrary,
  type ConfigurationSaveRequest,
  type RecentConfigurationValue,
  type SavedConfigurationDocument,
  type SavedConfigurationSummary
} from '../../shared/config-library'
import { MAXIMUM_CONFIGURATION_TEXT_SIZE } from '../../shared/configuration-documents'
import type { DeviceConfiguration } from '../../shared/device'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import type { RecentConfigurations } from './recent-configurations'

const FILE_EXTENSION = '.json'

export class ConfigLibraryService {
  constructor(
    private readonly directory: string,
    private readonly recent: RecentConfigurations
  ) {}

  async list(): Promise<ConfigLibraryResult<ConfigurationLibrary>> {
    const recent = await this.recent.list()

    let fileNames: string[]
    try {
      fileNames = await readdir(this.directory)
    } catch (error) {
      if (isMissing(error)) return { ok: true, value: { saved: [], recent, unreadable: 0 } }
      return failure('read_failed', messageOf(error, 'Failed to read the configuration folder.'))
    }

    const saved: SavedConfigurationSummary[] = []
    let unreadable = 0
    for (const fileName of fileNames) {
      if (!fileName.endsWith(FILE_EXTENSION)) continue
      const id = fileName.slice(0, -FILE_EXTENSION.length)
      if (!CONFIGURATION_ID_PATTERN.test(id)) {
        unreadable += 1
        continue
      }
      try {
        saved.push(await this.summaryOf(id))
      } catch {
        unreadable += 1
      }
    }
    saved.sort((left, right) => right.modifiedAt - left.modifiedAt)
    return { ok: true, value: { saved, recent, unreadable } }
  }

  async read(id: string): Promise<ConfigLibraryResult<SavedConfigurationDocument>> {
    try {
      return { ok: true, value: { name: id, configuration: await this.readSaved(id) } }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No saved configuration named "${id}".`)
      return failure(
        'invalid_configuration',
        messageOf(error, 'The saved configuration is unreadable.')
      )
    }
  }

  async save(
    request: ConfigurationSaveRequest
  ): Promise<ConfigLibraryResult<SavedConfigurationSummary>> {
    const name = request.name.trim()
    if (name.length === 0 || name.length > MAXIMUM_CONFIGURATION_NAME) {
      return failure(
        'invalid_configuration',
        `A configuration name is 1 to ${MAXIMUM_CONFIGURATION_NAME} characters.`
      )
    }
    const id = configurationIdFor(name)
    if (!id) {
      return failure('invalid_configuration', 'A name needs at least one letter or digit.')
    }

    let content: string
    try {
      content = `${JSON.stringify(parseDeviceConfigurationJson(request.json), null, 2)}\n`
    } catch (error) {
      return failure(
        'invalid_configuration',
        messageOf(error, 'The draft cannot be saved to the library.')
      )
    }

    try {
      await mkdir(this.directory, { recursive: true })
      const existing = await this.savedIds()
      if (!existing.includes(id) && existing.length >= MAXIMUM_SAVED_CONFIGURATIONS) {
        return failure(
          'limit_reached',
          `The library holds at most ${MAXIMUM_SAVED_CONFIGURATIONS} configurations.`
        )
      }
      await writeFile(this.pathFor(id), content, 'utf8')
      return { ok: true, value: await this.summaryOf(id) }
    } catch (error) {
      return failure('write_failed', messageOf(error, 'Failed to write the configuration.'))
    }
  }

  async remove(id: string): Promise<ConfigLibraryResult<void>> {
    try {
      await rm(this.pathFor(id))
      return { ok: true, value: undefined }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No saved configuration named "${id}".`)
      return failure('write_failed', messageOf(error, 'Failed to delete the configuration.'))
    }
  }

  async readRecent(path: string): Promise<ConfigLibraryResult<RecentConfigurationValue>> {
    const listed = (await this.recent.list()).some((entry) => entry.path === path)
    if (!listed) return failure('not_found', 'That file is not in the recent list any more.')
    try {
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > MAXIMUM_CONFIGURATION_TEXT_SIZE) {
        return failure('invalid_configuration', 'That file is not a configuration document.')
      }
      return {
        ok: true,
        value: {
          configuration: parseDeviceConfigurationJson(await readFile(path, 'utf8')),
          fileName: basename(path)
        }
      }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', 'That file is no longer where it was.')
      return failure('invalid_configuration', messageOf(error, 'The file is unreadable.'))
    }
  }

  async forgetRecent(path: string): Promise<ConfigLibraryResult<void>> {
    await this.recent.forget(path)
    return { ok: true, value: undefined }
  }

  private async summaryOf(id: string): Promise<SavedConfigurationSummary> {
    const path = this.pathFor(id)
    const configuration = await this.readSaved(id)
    const metadata = await stat(path)
    return {
      id,
      name: id,
      board: configuration.board,
      screenCount: screensOf(configuration).length,
      widgetCount: allWidgetsOf(configuration).length,
      sizeBytes: metadata.size,
      modifiedAt: metadata.mtimeMs
    }
  }

  private async savedIds(): Promise<string[]> {
    try {
      return (await readdir(this.directory))
        .filter((fileName) => fileName.endsWith(FILE_EXTENSION))
        .map((fileName) => fileName.slice(0, -FILE_EXTENSION.length))
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  private async readSaved(id: string): Promise<DeviceConfiguration> {
    const path = this.pathFor(id)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > MAXIMUM_CONFIGURATION_TEXT_SIZE) {
      throw new Error(
        `A configuration file must not exceed ${MAXIMUM_CONFIGURATION_TEXT_SIZE} bytes.`
      )
    }
    return parseDeviceConfigurationJson(await readFile(path, 'utf8'))
  }

  private pathFor(id: string): string {
    const fileName = `${id}${FILE_EXTENSION}`
    const path = join(this.directory, fileName)
    if (!CONFIGURATION_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(`"${id}" is not a valid configuration identifier.`)
    }
    return path
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function failure(code: ConfigLibraryError['code'], message: string): ConfigLibraryResult<never> {
  return { ok: false, error: { code, message } }
}
