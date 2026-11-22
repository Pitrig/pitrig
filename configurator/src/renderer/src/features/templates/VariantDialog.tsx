import { Button } from '@/components/ui/button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import type { DashboardTemplateSummary } from '@shared/templates'
import { t } from '@shared/ui-text'
import { DashboardThumbnail } from './DashboardThumbnail'
import { variantSummary } from './template-variants'

export function VariantDialog({
  summary,
  onPick,
  onClose
}: {
  summary: DashboardTemplateSummary
  onPick: (variant: DashboardTemplateSummary) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <ModalDialog
      label={t('templates.variantDialog.label')}
      className="flex w-[30rem] flex-col gap-3 p-4"
      onClose={onClose}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t('templates.variantDialog.title', { name: summary.name })}
        </h2>
        <p className="text-muted-foreground">{t('templates.variantDialog.hint')}</p>
      </div>
      <div className="space-y-1">
        {(summary.variants ?? []).map((variant) => (
          <button
            key={variant.id}
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md border p-2 text-left hover:bg-muted"
            onClick={() => onPick(variantSummary(summary, variant))}
          >
            <span className="h-16 w-24 flex-none overflow-hidden rounded border bg-black/40 p-1">
              <DashboardThumbnail id={variant.id} board={summary.board} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{variant.label}</span>
              {variant.description ? (
                <span className="line-clamp-3 block text-[11px] leading-4 text-muted-foreground">
                  {variant.description}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </ModalDialog>
  )
}
