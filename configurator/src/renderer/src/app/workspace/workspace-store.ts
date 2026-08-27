import { create } from 'zustand'

const STORAGE_KEY = 'simcore.workspace'

export const WORKSPACE_TABS = [
  'dashboard',
  'modules',
  'protocol',
  'configs',
  'firmware',
  'info',
  'debug'
] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

export const DASHBOARD_VIEWS = ['canvas', 'templates', 'fonts', 'images'] as const

export type DashboardView = (typeof DASHBOARD_VIEWS)[number]

export const DEBUG_VIEWS = ['console', 'bench'] as const

export type DebugView = (typeof DEBUG_VIEWS)[number]

interface PersistedWorkspace {
  tab: WorkspaceTab
  dashboardView: DashboardView
  debugView: DebugView
  railExpanded: boolean
}

interface WorkspaceStore extends PersistedWorkspace {
  setTab: (tab: WorkspaceTab) => void
  setDashboardView: (view: DashboardView) => void
  setDebugView: (view: DebugView) => void
  toggleRail: () => void
}

const DEFAULTS: PersistedWorkspace = {
  tab: 'dashboard',
  dashboardView: 'canvas',
  debugView: 'console',
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
      debugView: DEBUG_VIEWS.includes(stored.debugView as DebugView)
        ? (stored.debugView as DebugView)
        : DEFAULTS.debugView,
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
  setDebugView: (debugView) => set({ debugView }),
  toggleRail: () => set((current) => ({ railExpanded: !current.railExpanded }))
}))

useWorkspaceStore.subscribe(({ tab, dashboardView, debugView, railExpanded }) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab, dashboardView, debugView, railExpanded })
    )
  } catch {
  }
})
