import { create } from 'zustand'

const STORAGE_KEY = 'simcore.workspace'

export const WORKSPACE_TABS = [
  'dashboard',
  'modules',
  'protocol',
  'configs',
  'firmware',
  'info'
] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

const DASHBOARD_VIEWS = ['canvas', 'templates', 'fonts', 'images'] as const

export type DashboardView = (typeof DASHBOARD_VIEWS)[number]

const MODULES_VIEWS = ['leds', 'matrix'] as const

export type ModulesView = (typeof MODULES_VIEWS)[number]

interface PersistedWorkspace {
  tab: WorkspaceTab
  dashboardView: DashboardView
  modulesView: ModulesView
  railExpanded: boolean
}

interface WorkspaceStore extends PersistedWorkspace {
  setTab: (tab: WorkspaceTab) => void
  setDashboardView: (view: DashboardView) => void
  setModulesView: (view: ModulesView) => void
  toggleRail: () => void
}

const DEFAULTS: PersistedWorkspace = {
  tab: 'dashboard',
  dashboardView: 'canvas',
  modulesView: 'leds',
  railExpanded: true
}

function restore(): PersistedWorkspace {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<PersistedWorkspace>
    return {
      tab: WORKSPACE_TABS.includes(stored.tab as WorkspaceTab)
        ? (stored.tab as WorkspaceTab)
        : DEFAULTS.tab,
      dashboardView: DASHBOARD_VIEWS.includes(stored.dashboardView as DashboardView)
        ? (stored.dashboardView as DashboardView)
        : DEFAULTS.dashboardView,
      modulesView: MODULES_VIEWS.includes(stored.modulesView as ModulesView)
        ? (stored.modulesView as ModulesView)
        : DEFAULTS.modulesView,
      railExpanded: stored.railExpanded ?? DEFAULTS.railExpanded
    }
  } catch {
    return DEFAULTS
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...restore(),
  setTab: (tab) => set({ tab }),
  setDashboardView: (dashboardView) => set({ dashboardView }),
  setModulesView: (modulesView) => set({ modulesView }),
  toggleRail: () => set((current) => ({ railExpanded: !current.railExpanded }))
}))

useWorkspaceStore.subscribe(({ tab, dashboardView, modulesView, railExpanded }) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab, dashboardView, modulesView, railExpanded })
    )
  } catch {
  }
})
