import { BrowserWindow, ipcMain } from 'electron'

import {
  isConfigurationIdRequest,
  isConfigurationPathRequest,
  isConfigurationSaveRequest,
  isJsonDocumentRequest,
  isTemplateIdRequest,
  isTemplateSaveRequest
} from './request-guards'
import {
  CONFIG_LIBRARY_DELETE_CHANNEL,
  CONFIG_LIBRARY_LIST_CHANNEL,
  CONFIG_LIBRARY_READ_CHANNEL,
  CONFIG_LIBRARY_SAVE_CHANNEL,
  CONFIG_RECENT_FORGET_CHANNEL,
  CONFIG_RECENT_READ_CHANNEL,
  type ConfigLibraryResult
} from '../../shared/config-library'
import {
  CONFIGURATION_FILE_LOAD_CHANNEL,
  CONFIGURATION_FILE_SAVE_CHANNEL,
  type ConfigurationFileResult
} from '../../shared/configuration-files'
import {
  TEMPLATE_DELETE_CHANNEL,
  TEMPLATE_LIST_CHANNEL,
  TEMPLATE_READ_CHANNEL,
  TEMPLATE_SAVE_CHANNEL,
  type TemplateResult
} from '../../shared/templates'
import { ConfigurationFileService } from '../configuration-files/configuration-file-service'
import { ConfigLibraryService } from '../configs/config-library-service'
import { TemplateService } from '../templates/template-service'

export function registerLibraryHandlers(
  configurationFileService: ConfigurationFileService,
  configLibraryService: ConfigLibraryService,
  templateService: TemplateService
): void {
  ipcMain.handle(CONFIGURATION_FILE_LOAD_CHANNEL, (event) =>
    configurationFileService.load(
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  )
  ipcMain.handle(CONFIGURATION_FILE_SAVE_CHANNEL, (event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      const result: ConfigurationFileResult<never> = {
        ok: false,
        error: { code: 'invalid_configuration', message: 'Invalid configuration file request.' }
      }
      return result
    }
    return configurationFileService.save(
      request.json,
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  })
  ipcMain.handle(CONFIG_LIBRARY_LIST_CHANNEL, () => configLibraryService.list())
  ipcMain.handle(CONFIG_LIBRARY_READ_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationIdRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.read(request.id)
  })
  ipcMain.handle(CONFIG_LIBRARY_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationSaveRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.save(request)
  })
  ipcMain.handle(CONFIG_LIBRARY_DELETE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationIdRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.remove(request.id)
  })
  ipcMain.handle(CONFIG_RECENT_READ_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationPathRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.readRecent(request.path)
  })
  ipcMain.handle(CONFIG_RECENT_FORGET_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationPathRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.forgetRecent(request.path)
  })
  ipcMain.handle(TEMPLATE_LIST_CHANNEL, () => templateService.list())
  ipcMain.handle(TEMPLATE_READ_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.read(request.id, request.kind)
  })
  ipcMain.handle(TEMPLATE_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateSaveRequest(request)) return invalidTemplateRequest()
    return templateService.save(request)
  })
  ipcMain.handle(TEMPLATE_DELETE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.remove(request.id, request.kind)
  })
}

function invalidConfigLibraryRequest(): ConfigLibraryResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_configuration', message: 'Invalid configuration library request.' }
  }
}

function invalidTemplateRequest(): TemplateResult<never> {
  return { ok: false, error: { code: 'invalid_template', message: 'Invalid template request.' } }
}
