import { useEffect } from 'react'
import { create } from 'zustand'

import type { PitrigBoardId, SerialPortSummary } from '@shared/device'
import type {
  FirstInstallError,
  FirstInstallProgress,
  FirstInstallValue
} from '@shared/first-install'
import { t } from '@shared/ui-text'
import { operationErrorMessage } from '@/features/device/bridge-errors'
import { writeEventLog } from '@/lib/event-log'
import { useBoardUpdateStore } from '../board-update-store'
import { preferredPort, suggestedBoard, usbPorts } from './first-install-ports'

const PORT_POLL_MS = 1_000

export type FirstInstallPhase = 'choose' | 'running' | 'boot' | 'confirm' | 'finished' | 'failed'

interface FirstInstallStore {
  open: boolean
  phase: FirstInstallPhase
  board?: PitrigBoardId
  portId?: string
  ports: SerialPortSummary[]
  progress?: FirstInstallProgress
  message?: string
  backup?: string
  manualBoot?: boolean
  confirmed?: { board: PitrigBoardId; portId: string }
}

export const useFirstInstallStore = create<FirstInstallStore>(() => ({
  open: false,
  phase: 'choose',
  ports: []
}))

export function openFirstInstall(initial: { board?: PitrigBoardId; portId?: string } = {}): void {
  useFirstInstallStore.setState({
    open: true,
    phase: 'choose',
    board: initial.board,
    portId: initial.portId,
    progress: undefined,
    message: undefined,
    backup: undefined,
    manualBoot: undefined,
    confirmed: undefined
  })
  void refreshInstallPorts()
}

export function closeFirstInstall(): void {
  if (useFirstInstallStore.getState().phase === 'running') return
  useFirstInstallStore.setState({ open: false })
}

export function chooseInstall(choice: { board?: PitrigBoardId; portId?: string }): void {
  useFirstInstallStore.setState(choice)
}

export function returnToChoice(): void {
  useFirstInstallStore.setState({ phase: 'choose', message: undefined, confirmed: undefined })
}

export async function refreshInstallPorts(): Promise<void> {
  const listed = await window.pitrig.listSerialPorts().catch(() => undefined)
  if (!listed?.ok) return
  const ports = usbPorts(listed.value)
  const { portId, board } = useFirstInstallStore.getState()
  const kept = ports.find((port) => port.id === portId) ?? preferredPort(ports, board)
  useFirstInstallStore.setState({
    ports,
    portId: kept?.id,
    board: board ?? suggestedBoard(kept)
  })
}

export function usePortPolling(): void {
  useEffect(() => {
    const timer = window.setInterval(() => void refreshInstallPorts(), PORT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])
}

export async function startFirstInstall(manualBoot: boolean): Promise<void> {
  const { board, portId, phase, confirmed } = useFirstInstallStore.getState()
  if (!board || !portId || phase === 'running') return
  const eraseConfirmed = confirmed?.board === board && confirmed.portId === portId
  useFirstInstallStore.setState({
    phase: 'running',
    progress: undefined,
    message: undefined,
    manualBoot
  })
  const stop = window.pitrig.onPitrigInstallProgress((progress) =>
    useFirstInstallStore.setState({ progress })
  )
  try {
    const result = await window.pitrig.installPitrig({ board, portId, manualBoot, eraseConfirmed })
    writeEventLog('First install finished', result)
    if (result.ok) finish(result.value)
    else fail(result.error)
  } catch (error) {
    useFirstInstallStore.setState({ phase: 'failed', message: operationErrorMessage(error) })
  } finally {
    stop()
  }
}

export function cancelFirstInstall(): void {
  void window.pitrig.cancelPitrigInstall()
}

export function installAnyway(): void {
  const { board, portId, manualBoot } = useFirstInstallStore.getState()
  if (!board || !portId) return
  useFirstInstallStore.setState({ confirmed: { board, portId } })
  void startFirstInstall(manualBoot ?? false)
}

function finish(value: FirstInstallValue): void {
  const backup = value.backup ?? useFirstInstallStore.getState().backup
  const { version } = value
  const message = !value.connected
    ? t('firmware.firstInstall.notAnswering', { version })
    : backup
      ? t('firmware.firstInstall.installedCopy', { version, backup })
      : t('firmware.firstInstall.installed', { version })
  useBoardUpdateStore.setState({
    outcome: { kind: value.connected ? 'success' : 'warning', message }
  })
  useFirstInstallStore.setState({ phase: 'finished', message, backup, progress: undefined })
}

function fail(error: FirstInstallError): void {
  const backup = error.backup ?? useFirstInstallStore.getState().backup
  const boot = error.code === 'no_answer'
  useFirstInstallStore.setState({
    phase: boot ? 'boot' : error.code === 'erase_unconfirmed' ? 'confirm' : 'failed',
    confirmed: boot ? useFirstInstallStore.getState().confirmed : undefined,
    message: error.message,
    backup,
    progress: undefined
  })
  if (boot) void refreshInstallPorts()
}
