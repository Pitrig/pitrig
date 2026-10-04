import { Button } from './button'
import { answerConfirm, useConfirmStore } from './confirm-store'
import { ModalDialog } from './modal-dialog'
import { t } from '@shared/ui-text'

export function ConfirmDialogHost(): React.JSX.Element | null {
  const request = useConfirmStore((state) => state.request)
  if (!request) return null
  return (
    <ModalDialog
      key={request.id}
      label={request.message}
      className="w-[26rem] space-y-4 p-4"
      onClose={() => answerConfirm(false)}
    >
      <p className="whitespace-pre-line text-sm text-foreground">{request.message}</p>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          data-autofocus={request.danger || undefined}
          onClick={() => answerConfirm(false)}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant={request.danger ? 'destructive' : 'default'}
          data-autofocus={!request.danger || undefined}
          onClick={() => answerConfirm(true)}
        >
          {t('common.ok')}
        </Button>
      </div>
    </ModalDialog>
  )
}
