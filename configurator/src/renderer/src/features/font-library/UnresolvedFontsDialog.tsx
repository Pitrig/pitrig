import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useFontLibraryStore } from './font-library-store'
import { t } from '@shared/ui-text'

export function UnresolvedFontsDialog({
  families,
  onRetry,
  onClose
}: {
  families: readonly string[]
  onRetry: () => void
  onClose: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const refresh = useFontLibraryStore((state) => state.refresh)
  const entries = useFontLibraryStore((state) => state.entries)
  const outstanding = families.filter((family) => !entries.some((entry) => entry.id === family))

  const choose = async (family: string): Promise<void> => {
    setBusy(family)
    setError(undefined)
    const result = await window.pitrig.importFontFace({ id: family }).catch(() => undefined)
    setBusy(undefined)
    if (!result) return setError(t('fonts.fontsPage.theFontCouldNotBe'))
    if (!result.ok) return setError(result.error.message)
    await refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('fonts.unresolvedFontsDialog.fontsThisDashboardNeeds')}
        className="w-[28rem] space-y-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t('fonts.unresolvedFontsDialog.fontsThisDashboardNeeds')}</h2>
          <p className="text-muted-foreground">
            {t('fonts.unresolvedFontsDialog.nothingWasWrittenToThe')}</p>
        </div>
        <ul className="space-y-1">
          {families.map((family) => {
            const resolved = !outstanding.includes(family)
            return (
              <li
                key={family}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className={`min-w-0 flex-1 truncate ${resolved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {family}
                </span>
                {resolved ? (
                  <span className="shrink-0 text-emerald-500">{t('fonts.unresolvedFontsDialog.found')}</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy !== undefined}
                    onClick={() => void choose(family)}
                  >
                    {busy === family ? t('fonts.unresolvedFontsDialog.opening') : t('fonts.unresolvedFontsDialog.chooseTtfOtf')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {error ? <p className="text-red-400">{error}</p> : null}
        <p className="text-muted-foreground">
          {t('fonts.unresolvedFontsDialog.orPickADifferentFont')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}</Button>
          <Button disabled={outstanding.length > 0} onClick={onRetry}>
            {t('fonts.unresolvedFontsDialog.saveAgain')}</Button>
        </div>
      </div>
    </div>
  )
}
