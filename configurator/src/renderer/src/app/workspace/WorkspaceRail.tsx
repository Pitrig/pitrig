import {
  Cable,
  Cpu,
  Files,
  Info,
  LayoutDashboard,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Terminal
} from 'lucide-react'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/features/device/device-store'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { useDraftState } from '@/features/device/draft-state'
import { useWorkspaceStore, WORKSPACE_TABS, type WorkspaceTab } from './workspace-store'

/**
 * The rail that switches workspaces.
 *
 * Collapsed it is a column of icons; expanded it names them. The state is kept
 * across restarts, because which one an author prefers is a property of their
 * screen rather than of this session.
 *
 * The dots are the reason the rail is more than a menu: a draft that differs
 * from the board, or a board holding firmware it has not started yet, is
 * something you need to know while looking at another page.
 */

const COLLAPSED_WIDTH = '3.5rem'
const EXPANDED_WIDTH = '11.25rem'

interface RailEntry {
  label: string
  icon: LucideIcon
  hint: string
}

/**
 * What each workspace looks like in the rail. Keyed rather than listed, so the
 * compiler answers for coverage — a workspace added to `WORKSPACE_TABS` with no
 * entry here fails to build rather than rendering a gap — and so the order
 * lives in exactly one place.
 */
const ENTRIES: Record<WorkspaceTab, RailEntry> = {
  dashboard: {
    label: 'Dashboard',
    icon: LayoutDashboard,
    hint: 'Draw the dashboard, and the fonts, images and templates it is made of'
  },
  modules: { label: 'Modules', icon: Puzzle, hint: 'Buttons, encoders and LEDs' },
  protocol: { label: 'Protocol', icon: Cable, hint: 'Telemetry link and SimHub' },
  configs: { label: 'Configs', icon: Files, hint: 'Files, saved configurations and JSON' },
  firmware: { label: 'Firmware', icon: Cpu, hint: 'Install a firmware image over serial' },
  info: { label: 'Info', icon: Info, hint: 'What the connected board is' },
  debug: { label: 'Debug', icon: Terminal, hint: 'Serial traffic and control commands' }
}

// A workspace that owns one configuration document lights up for that document
// alone; Configs lights up for any of them, because it is where all three are
// listed. Editing a baud rate used to put a dot on Dashboard.
const OWNED_DOCUMENT: Partial<Record<WorkspaceTab, ConfigurationDocumentId>> = {
  dashboard: 'dashboard',
  modules: 'modules',
  protocol: 'protocol'
}

export function WorkspaceRail(): React.JSX.Element {
  const tab = useWorkspaceStore((state) => state.tab)
  const setTab = useWorkspaceStore((state) => state.setTab)
  const expanded = useWorkspaceStore((state) => state.railExpanded)
  const toggleRail = useWorkspaceStore((state) => state.toggleRail)
  const session = useDeviceStore((state) => state.session)
  const { dirty, dirtyDocuments } = useDraftState()

  // Cmd/Ctrl + 1…7, in the order the rail lists them. Digits are free: the
  // editor's own accelerators are all letters.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const target = WORKSPACE_TABS[Number(event.key) - 1]
      if (!target) return
      event.preventDefault()
      setTab(target)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setTab])

  const firmwarePending = Boolean(session?.firmware?.rebootRequired || session?.firmware?.pendingVerify)
  const dotFor = (candidate: WorkspaceTab): string | undefined => {
    if (candidate === 'firmware' && firmwarePending) return 'bg-amber-400'
    if (candidate === 'configs' && dirty) return 'bg-sky-400'
    const owned = OWNED_DOCUMENT[candidate]
    if (owned && dirtyDocuments.includes(owned)) return 'bg-sky-400'
    return undefined
  }

  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen
  return (
    <nav
      aria-label="Workspace"
      className="flex min-h-0 flex-none flex-col gap-1 border-r p-2 transition-[width] duration-150"
      style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse the workspace rail' : 'Expand the workspace rail'}
        title={expanded ? 'Collapse' : 'Expand'}
        className="flex h-9 flex-none items-center gap-2.5 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={toggleRail}
      >
        <ToggleIcon aria-hidden="true" className="size-4 flex-none" />
        {expanded ? <span className="truncate text-xs">Collapse</span> : null}
      </button>

      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {WORKSPACE_TABS.map((candidate) => {
          const entry = ENTRIES[candidate]
          const active = candidate === tab
          const dot = dotFor(candidate)
          return (
            <button
              key={candidate}
              type="button"
              aria-current={active ? 'page' : undefined}
              title={expanded ? entry.hint : `${entry.label} — ${entry.hint}`}
              className={cn(
                'relative flex h-10 flex-none items-center gap-2.5 rounded-md px-2.5 text-left text-xs font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setTab(candidate)}
            >
              {/* The accent bar rather than a colour swap: it survives the
                  collapsed rail, where a label is not there to carry it. */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors',
                  active ? 'bg-primary' : 'bg-transparent'
                )}
              />
              <span className="relative flex-none">
                <entry.icon aria-hidden="true" className="size-4" />
                {dot ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -top-0.5 -right-1 size-1.5 rounded-full ring-2 ring-background',
                      dot
                    )}
                  />
                ) : null}
              </span>
              {expanded ? <span className="truncate">{entry.label}</span> : null}
              <span className="sr-only">{expanded ? '' : entry.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
