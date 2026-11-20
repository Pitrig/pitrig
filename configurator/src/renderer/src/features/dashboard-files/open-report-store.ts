import { create } from 'zustand'

export interface OpenReport {
  kind: 'success' | 'error'
  message: string
}

interface OpenReportState {
  report?: OpenReport
  show: (report: OpenReport) => void
  dismiss: () => void
}

export const useOpenReportStore = create<OpenReportState>((set) => ({
  show: (report) => set({ report }),
  dismiss: () => set({ report: undefined })
}))
