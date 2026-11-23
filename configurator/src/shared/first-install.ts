import type { PitrigBoardId } from './device'
import type { UsbPortKind } from './usb-ports'

export const FIRST_INSTALL_START_CHANNEL = 'first-install:start' as const
export const FIRST_INSTALL_CANCEL_CHANNEL = 'first-install:cancel' as const
export const FIRST_INSTALL_PROGRESS_CHANNEL = 'first-install:progress' as const

export type InstallChip = 'esp32s3' | 'esp32p4'

export interface BoardInstallProfile {
  chip: InstallChip
  release: string
  link: 'native_usb' | 'uart'
  separateLinkConnector: boolean
}

export const BOARD_INSTALL: Record<PitrigBoardId, BoardInstallProfile> = {
  t_display_s3: {
    chip: 'esp32s3',
    release: 't-display-s3',
    link: 'native_usb',
    separateLinkConnector: false
  },
  guition_esp32_4848s040: {
    chip: 'esp32s3',
    release: 'guition-4848s040',
    link: 'uart',
    separateLinkConnector: false
  },
  guition_jc1060p470c: {
    chip: 'esp32p4',
    release: 'jc1060p470c',
    link: 'native_usb',
    separateLinkConnector: true
  },
  esp32s3_devkit: {
    chip: 'esp32s3',
    release: 'esp32s3-devkit',
    link: 'native_usb',
    separateLinkConnector: false
  }
}

export function linkMovesToAnotherConnector(board: PitrigBoardId, port: UsbPortKind): boolean {
  const profile = BOARD_INSTALL[board]
  if (profile.link === 'uart') return false
  return profile.separateLinkConnector || port === 'bridge' || port === 'other'
}

export interface FirstInstallRequest {
  board: PitrigBoardId
  portId: string
  manualBoot: boolean
}

export type FirstInstallStage = 'download' | 'connect' | 'erase' | 'write' | 'verify' | 'restart'

export const FIRST_INSTALL_STAGES: readonly FirstInstallStage[] = [
  'download',
  'connect',
  'erase',
  'write',
  'verify',
  'restart'
]

export interface FirstInstallProgress {
  stage: FirstInstallStage
  completed: number
  total: number
  message: string
  prompt?: 'move_cable'
}

export type FirstInstallErrorCode =
  | 'busy'
  | 'invalid_request'
  | 'port_missing'
  | 'port_busy'
  | 'permission_denied'
  | 'no_answer'
  | 'already_pitrig'
  | 'backup_failed'
  | 'chip_mismatch'
  | 'revision_unsupported'
  | 'flash_too_small'
  | 'secured'
  | 'release_missing'
  | 'archive_incomplete'
  | 'download_failed'
  | 'write_failed'
  | 'verify_failed'
  | 'cancelled'
  | 'serial_error'

export interface FirstInstallError {
  code: FirstInstallErrorCode
  message: string
  erased: boolean
  backup?: string
}

export interface FirstInstallValue {
  version: string
  connected: boolean
  backup?: string
}

export type FirstInstallResult =
  | { ok: true; value: FirstInstallValue }
  | { ok: false; error: FirstInstallError }
