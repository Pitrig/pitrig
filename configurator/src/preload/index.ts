import { contextBridge } from 'electron'

import { UI_LANGUAGE_GLOBAL, uiLanguageFromArguments } from '../shared/ui-language'
import { productApi } from './api'

contextBridge.exposeInMainWorld('pitrig', productApi)
contextBridge.exposeInMainWorld(UI_LANGUAGE_GLOBAL, uiLanguageFromArguments(process.argv))
