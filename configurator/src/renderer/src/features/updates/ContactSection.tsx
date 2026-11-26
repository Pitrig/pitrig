import { Button } from '@/components/ui/button'
import { useCopy } from '@/lib/use-copy'
import { t } from '@shared/ui-text'

const CONTACT_EMAIL = 'contact.pitrig@gmail.com'
const CARD = 'rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm'
const ACTION = 'h-7 flex-none px-2.5'

export function ContactSection(): React.JSX.Element {
  const { copied, copy } = useCopy()

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{t('contact.section.title')}</h3>
          <p className="mt-[3px] text-[11.5px] text-muted-foreground">{t('contact.section.description')}</p>
          <p className="mt-[3px] text-[11.5px]">{CONTACT_EMAIL}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Button
            variant="outline"
            className={ACTION}
            onClick={() => void window.pitrig.openUpdatePage({ page: 'contact' })}
          >
            {t('contact.section.form')}
          </Button>
          <Button variant="outline" className={ACTION} onClick={() => void copy(CONTACT_EMAIL)}>
            {copied ? t('contact.section.copied') : t('contact.section.copyEmail')}
          </Button>
        </div>
      </div>
    </section>
  )
}
