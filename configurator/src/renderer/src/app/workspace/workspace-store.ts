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

export const DASHBOARD_VIEWS = ['canvas', 'templates', 'fonts', 'images'] as const

export type DashboardView = (typeof DASHBOARD_VIEWS)[number]

interface PersistedWorkspace {
  tab: WorkspaceTab
  dashboardView: DashboardView
  railExpanded: boolean
}

interface WorkspaceStore extends PersistedWorkspace {
  setTab: (tab: WorkspaceTab) => void
  setDashboardView: (view: DashboardView) => void
  toggleRail: () => void
}

const DEFAULTS: PersistedWorkspace = {
  tab: 'dashboard',
  dashboardView: 'canvas',
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
  toggleRail: () => set((current) => ({ railExpanded: !current.railExpanded }))
}))

useWorkspaceStore.subscribe(({ tab, dashboardView, railExpanded }) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab, dashboardView, railExpanded })
    )
  } catch {
  }
})
