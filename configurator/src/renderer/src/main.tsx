import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './styles/globals.css'
import { t, UI_LANGUAGE } from '@shared/ui-text'

document.documentElement.lang = UI_LANGUAGE

const root = document.getElementById('root')

if (!root) {
  throw new Error(t('app.main.rendererRootElementWasNot'))
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
