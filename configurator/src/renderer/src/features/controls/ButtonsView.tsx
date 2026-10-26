import { useEffect } from 'react'

import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useBridgeStore } from '@/features/telemetry/bridge-store'
import { BindingList } from './BindingList'
import { boardHasDisplay, inputLabel } from './controls-document'
import { HomeSection } from './HomeSection'
import { InputButtonList } from './InputButtonList'
import { armCapture, useInputTester, useInputTesterFeed } from './input-tester'
import { RuleList } from './RuleList'
import { SwitchSection } from './SwitchSection'

function TesterStatus({ listening }: { listening: boolean }): React.JSX.Element {
  const last = useInputTester((state) => state.lastInput)
  const capturing = useInputTester((state) => state.capture !== undefined)
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        listening ? 'border-emerald-400/30' : 'border-amber-400/40 text-amber-200'
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 flex-none rounded-full', listening ? 'bg-emerald-400' : 'bg-amber-400')}
      />
      <span className="flex-1">
        {!listening
          ? t('controls.buttonsView.startSimhubWithThePlugin')
          : capturing
            ? t('controls.buttonsView.pressTheButtonToAssign')
            : last
              ? t('controls.buttonsView.lastInput', {
                  input: inputLabel(last.name),
                  state: last.down ? t('controls.buttonsView.down') : t('controls.buttonsView.up')
                })
              : t('controls.buttonsView.pressAnyButton')}
      </span>
      {capturing ? (
        <button
          type="button"
          className="rounded-md border px-2 py-0.5 hover:bg-white/5"
          onClick={() => armCapture(undefined)}
        >
          {t('common.cancel')}
        </button>
      ) : null}
    </div>
  )
}

export function ButtonsView(): React.JSX.Element {
  useInputTesterFeed()
  const draft = useDeviceStore((state) => state.draft)
  const listening = useBridgeStore((state) => state.status.plugin !== undefined)
  const capturing = useInputTester((state) => state.capture !== undefined)
  const display = boardHasDisplay(draft)

  useEffect(() => {
    if (!capturing) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') armCapture(undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capturing])

  return (
    <>
      <TesterStatus listening={listening} />
      <PageSection
        title={t('controls.buttonsView.buttons')}
        description={t('controls.buttonsView.buttonsDescription')}
      >
        <InputButtonList listening={listening} />
      </PageSection>
      <PageSection
        title={t('controls.buttonsView.multiPositionSwitch')}
        description={t('controls.buttonsView.switchDescription')}
      >
        <SwitchSection listening={listening} />
      </PageSection>
      <PageSection
        title={t('controls.buttonsView.whatTheButtonsDo')}
        description={t('controls.buttonsView.whatTheButtonsDoDescription')}
      >
        <BindingList />
      </PageSection>
      {display ? (
        <>
          <PageSection
            title={t('controls.buttonsView.screenRules')}
            description={t('controls.buttonsView.screenRulesDescription')}
          >
            <RuleList />
          </PageSection>
          <PageSection
            title={t('controls.buttonsView.home')}
            description={t('controls.buttonsView.homeDescription')}
          >
            <HomeSection />
          </PageSection>
        </>
      ) : null}
    </>
  )
}
