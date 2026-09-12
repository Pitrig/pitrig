import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './styles/globals.css'
import { t } from '@shared/ui-text'

const root = document.getElementById('root')

if (!root) {
  throw new Error(t('app.main.rendererRootElementWasNot'))
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
