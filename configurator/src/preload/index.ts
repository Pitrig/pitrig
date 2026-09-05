import { contextBridge } from 'electron'

import { productApi } from './api'

contextBridge.exposeInMainWorld('pitrig', productApi)
