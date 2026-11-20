import { useEffect } from 'react'
import { Gamepad2 } from 'lucide-react'

import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { BoardPicker } from '@/features/configuration/preview/BoardPicker'
import { useBridgeStore } from '@/features/telemetry/bridge-store'
import { ButtonList } from './ButtonList'
import { boardHasDisplay, inputLabel } from './inputs-document'
import { armCapture, useInputTester, useInputTesterFeed } from './input-tester'
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
          ? t('controls.controlsPage.startSimhubWithThePlugin')
          : capturing
            ? t('controls.controlsPage.pressTheButtonToAssign')
            : last
              ? t('controls.controlsPage.lastInput', {
                  input: inputLabel(last.name),
                  state: last.down ? t('controls.controlsPage.down') : t('controls.controlsPage.up')
                })
              : t('controls.controlsPage.pressAnyButton')}
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

export function ControlsPage(): React.JSX.Element {
  useInputTesterFeed()
  const draft = useDeviceStore((state) => state.draft)
  const listening = useBridgeStore((state) => state.status.plugin !== undefined)
  const capturing = useInputTester((state) => state.capture !== undefined)

  useEffect(() => {
    if (!capturing) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') armCapture(undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capturing])

  return (
    <PageShell
      title={t('controls.controlsPage.controls')}
      description={t('controls.controlsPage.whatTheButtonsOnYour')}
      actions={
        <>
          <BoardPicker />
          <SaveToBoardButton />
        </>
      }
    >
      {!draft ? (
        <PageSection title={t('controls.controlsPage.buttons')}>
          <EmptyState
            icon={<Gamepad2 aria-hidden="true" className="size-6" />}
            title={t('dashboard.configsPage.nothingOpen')}
          >
            <p>{t('controls.controlsPage.startANewSetupOn')}</p>
          </EmptyState>
        </PageSection>
      ) : (
        <>
          <TesterStatus listening={listening} />
          <PageSection
            title={t('controls.controlsPage.buttons')}
            description={t('controls.controlsPage.pressAddButtonThen')}
          >
            <ButtonList listening={listening} />
          </PageSection>
          {boardHasDisplay(draft) ? (
            <PageSection
              title={t('controls.controlsPage.rotarySwitch')}
              description={t('controls.controlsPage.eachPositionShowsOne')}
            >
              <SwitchSection listening={listening} />
            </PageSection>
          ) : null}
          <p className="px-1 text-[11px] text-muted-foreground">
            {t('controls.controlsPage.alsoInSimhub')}</p>
        </>
      )}
    </PageShell>
  )
}
