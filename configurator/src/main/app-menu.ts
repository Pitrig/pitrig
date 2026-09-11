import { app, Menu, MenuItem, systemPreferences, type MenuItemConstructorOptions } from 'electron'

import { isDevelopment } from './app-window'

type MenuRole = NonNullable<MenuItemConstructorOptions['role']>

const SHORTCUT_ROLES: MenuRole[] = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'selectAll',
  'close',
  'minimize',
  'togglefullscreen',
  'hide',
  'hideOthers',
  'quit'
]

const DEVELOPMENT_SHORTCUT_ROLES: MenuRole[] = ['reload', 'forceReload', 'toggleDevTools']

const WITHOUT_SYSTEM_EDIT_ITEMS = {
  NSDisabledDictationMenuItem: true,
  NSDisabledCharacterPaletteMenuItem: true,
  NSAutoFillSystemInsertMenuEnabled: false
}

export function applyApplicationMenu(): void {
  Menu.setApplicationMenu(null)
  if (process.platform !== 'darwin') return
  systemPreferences.registerDefaults(WITHOUT_SYSTEM_EDIT_ITEMS)
  void app.whenReady().then(installShortcutMenu)
}

function installShortcutMenu(): void {
  const roles = isDevelopment()
    ? [...SHORTCUT_ROLES, ...DEVELOPMENT_SHORTCUT_ROLES]
    : SHORTCUT_ROLES
  const shownWhileBuilding = new MenuItem({ label: app.name })
  const shortcuts = new Menu()
  shortcuts.append(shownWhileBuilding)
  for (const role of roles) shortcuts.append(new MenuItem({ role, visible: false }))
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: app.name, submenu: shortcuts }]))
  shownWhileBuilding.visible = false
}
