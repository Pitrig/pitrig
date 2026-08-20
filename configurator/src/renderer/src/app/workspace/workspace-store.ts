import { create } from 'zustand'

/**
 * Which workspace the window is showing, and how wide the rail that switches
 * them is.
 *
 * It sits beside `panel-store` rather than inside it for the same reason that
 * one sits outside the dashboard editor store: this describes the window, not
 * the document, and it outlives every draft. Both are kept across restarts —
 * an application that reopens on a different page than the one you left it on
 * is an application you have to navigate every launch.
 */

const STORAGE_KEY = 'simcore.workspace'

export const WORKSPACE_TABS = [
  'dashboard',
  'info',
  'protocol',
  'configs',
  'modules',
  'firmware',
  'debug'
] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

/**
 * The dashboard workspace is the one with pages of its own: the canvas the
 * author draws on, and the three libraries it draws from. They are sub-tabs
 * rather than rail entries because all four answer the same question — what
 * this dashboard is made of — and the rail answers a different one.
 */
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
      // A tab this build no longer has falls back rather than rendering nothing.
      tab: WORKSPACE_TABS.includes(stored.tab as WorkspaceTab)
        ? (stored.tab as WorkspaceTab)
        : DEFAULTS.tab,
      dashboardView: DASHBOARD_VIEWS.includes(stored.dashboardView as DashboardView)
        ? (stored.dashboardView as DashboardView)
        : DEFAULTS.dashboardView,
      railExpanded: stored.railExpanded ?? DEFAULTS.railExpanded
    }
  } catch {
    // Storage that cannot be read or parsed is storage the workspace does without.
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, dashboardView, railExpanded }))
  } catch {
    // Writing is a convenience; a full or blocked store must not break the app.
  }
})
