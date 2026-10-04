import { create } from 'zustand'

export interface ConfirmRequest {
  id: number
  message: string
  danger: boolean
  resolve: (confirmed: boolean) => void
}

export const useConfirmStore = create<{ request?: ConfirmRequest }>(() => ({}))

export function confirmAction(
  message: string,
  options: { danger?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = useConfirmStore.getState().request
    previous?.resolve(false)
    useConfirmStore.setState({
      request: { id: (previous?.id ?? 0) + 1, message, danger: options.danger ?? false, resolve }
    })
  })
}

export function answerConfirm(confirmed: boolean): void {
  const { request } = useConfirmStore.getState()
  if (!request) return
  useConfirmStore.setState({ request: undefined })
  request.resolve(confirmed)
}
