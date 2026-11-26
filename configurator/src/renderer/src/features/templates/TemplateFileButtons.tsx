import { FolderOpen, Share2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { kilobytes } from '@/features/font-library/font-library-store'
import type { TemplateKind } from '@shared/templates'
import { t } from '@shared/ui-text'
import { useTemplatesStore } from './templates-store'

export function ShareTemplateButton({
  id,
  kind,
  name,
  disabled,
  onNotice
}: {
  id: string
  kind: TemplateKind
  name: string
  disabled: boolean
  onNotice: (notice: string) => void
}): React.JSX.Element {
  const setError = useTemplatesStore((state) => state.setError)
  const [working, setWorking] = useState(false)

  const share = async (): Promise<void> => {
    setWorking(true)
    setError(undefined)
    try {
      const result = await window.pitrig.shareTemplate({ id, kind })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (!result.value.saved) return
      const missing = [...(result.value.missingImages ?? []), ...(result.value.missingFonts ?? [])]
      onNotice(
        [
          t('share.dialog.saved', {
            fileName: result.value.fileName ?? '',
            size: kilobytes(result.value.bytes ?? 0)
          }),
          missing.length > 0 ? t('share.dialog.savedWithout', { names: missing.join(', ') }) : ''
        ]
          .join(' ')
          .trim()
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : t('share.errors.notSaved'))
    } finally {
      setWorking(false)
    }
  }

  const label = t('templates.files.share', { name })
  return (
    <Button
      aria-label={label}
      title={label}
      className="h-7 px-2"
      variant="outline"
      disabled={disabled || working}
      onClick={() => void share()}
    >
      <Share2 aria-hidden="true" className="size-3.5" />
    </Button>
  )
}

export function OpenTemplateFileButton({
  kind,
  disabled,
  onNotice
}: {
  kind: TemplateKind
  disabled: boolean
  onNotice: (notice: string) => void
}): React.JSX.Element {
  const setError = useTemplatesStore((state) => state.setError)
  const refresh = useTemplatesStore((state) => state.refresh)
  const [working, setWorking] = useState(false)

  const open = async (): Promise<void> => {
    setWorking(true)
    setError(undefined)
    try {
      const result = await window.pitrig.importTemplateFile({ kind })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (!result.value) return
      await refresh()
      onNotice(t('templates.files.added', { name: result.value.name }))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('templates.saveToTemplates.theTemplateWasNotSaved')
      )
    } finally {
      setWorking(false)
    }
  }

  const label = t('templates.files.open')
  return (
    <Button
      aria-label={label}
      title={label}
      className="h-6 px-1.5"
      variant="outline"
      disabled={disabled || working}
      onClick={() => void open()}
    >
      <FolderOpen aria-hidden="true" className="size-3.5" />
    </Button>
  )
}
