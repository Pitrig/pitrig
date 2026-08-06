import { create } from 'zustand'

import type {
  DeviceConfiguration,
  DeviceSession,
  DeviceState,
  DeviceStatus
} from '../../../../shared/device'

interface DeviceStore {
  status: DeviceStatus
  session?: DeviceSession
  connectionRevision: number
  activeConfigurationJson: string
  draftConfigurationJson: string
  pendingConfiguration?: DeviceConfiguration
  rebootRequired: boolean
  applyDeviceState: (state: DeviceState) => void
  setDraftConfigurationJson: (json: string) => void
  reloadDraft: (session: DeviceSession) => void
  markConfigurationSaved: (configuration: DeviceConfiguration) => void
  markConfigurationReset: (configuration: DeviceConfiguration) => void
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  status: 'disconnected',
  connectionRevision: 0,
  activeConfigurationJson: '',
  draftConfigurationJson: '',
  rebootRequired: false,
  applyDeviceState: (state) =>
    set((current) => {
      if (state.status !== 'connected' || !state.session) {
        return {
          status: state.status,
          session: undefined,
          activeConfigurationJson: '',
          draftConfigurationJson: '',
          pendingConfiguration: undefined,
          rebootRequired: false
        }
      }

      const activeConfigurationJson = formatConfiguration(state.session.configuration)
      const sameActiveConfiguration =
        current.status === 'connected' &&
        current.session?.info.boardId === state.session.info.boardId &&
        current.session.info.generation === state.session.info.generation &&
        current.activeConfigurationJson === activeConfigurationJson

      if (sameActiveConfiguration) {
        return {
          status: state.status,
          session: state.session,
          rebootRequired:
            current.rebootRequired || (state.session.fontAssets?.rebootRequired ?? false)
        }
      }
      return {
        status: state.status,
        session: state.session,
        connectionRevision:
          current.connectionRevision + (current.status === 'connected' ? 0 : 1),
        activeConfigurationJson,
        draftConfigurationJson: activeConfigurationJson,
        pendingConfiguration: undefined,
        rebootRequired: state.session.fontAssets?.rebootRequired ?? false
      }
    }),
  setDraftConfigurationJson: (draftConfigurationJson) => set({ draftConfigurationJson }),
  reloadDraft: (session) => {
    const activeConfigurationJson = formatConfiguration(session.configuration)
    set((current) => ({
      session,
      activeConfigurationJson,
      draftConfigurationJson: activeConfigurationJson,
      rebootRequired: current.rebootRequired || (session.fontAssets?.rebootRequired ?? false)
    }))
  },
  markConfigurationSaved: (configuration) =>
    set({
      draftConfigurationJson: formatConfiguration(configuration),
      pendingConfiguration: configuration,
      rebootRequired: true
    }),
  markConfigurationReset: (configuration) =>
    set({
      draftConfigurationJson: formatConfiguration(configuration),
      pendingConfiguration: configuration,
      rebootRequired: true
    })
}))

export function formatConfiguration(configuration: DeviceConfiguration): string {
  return JSON.stringify(configuration, null, 2)
}
