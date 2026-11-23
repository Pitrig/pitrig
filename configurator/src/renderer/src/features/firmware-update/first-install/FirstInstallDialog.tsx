import { FIRST_INSTALL_STAGES } from '@shared/first-install'
import { t } from '@shared/ui-text'
import { Button } from '@/components/ui/button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { StepProgress } from '@/components/ui/step-progress'
import { FirstInstallChoice, PortChoice } from './FirstInstallChoice'
import {
  cancelFirstInstall,
  closeFirstInstall,
  returnToChoice,
  startFirstInstall,
  useFirstInstallStore,
  usePortPolling,
  type FirstInstallPhase
} from './first-install-store'

export function FirstInstallDialog(): React.JSX.Element | null {
  const open = useFirstInstallStore((state) => state.open)
  const phase = useFirstInstallStore((state) => state.phase)
  if (!open) return null
  return (
    <ModalDialog
      label={t('firmware.firstInstall.title')}
      className="w-[30rem] max-w-full space-y-3 p-4"
      dismissible={phase !== 'running'}
      onClose={closeFirstInstall}
    >
      <h2 className="text-sm font-semibold">{t('firmware.firstInstall.title')}</h2>
      <PhaseBody phase={phase} />
    </ModalDialog>
  )
}

function PhaseBody({ phase }: { phase: FirstInstallPhase }): React.JSX.Element {
  switch (phase) {
    case 'choose':
      return <FirstInstallChoice />
    case 'running':
      return <Running />
    case 'boot':
      return <BootStep />
    case 'finished':
      return <Finished />
    case 'failed':
      return <Failed />
  }
}

function Running(): React.JSX.Element {
  const progress = useFirstInstallStore((state) => state.progress)
  return (
    <StepProgress
      steps={FIRST_INSTALL_STAGES}
      current={progress ? FIRST_INSTALL_STAGES.indexOf(progress.stage) : 0}
      label={(stage) => t(`firmware.firstInstall.stage.${stage}`)}
      completed={progress?.completed}
      total={progress?.total}
      message={progress?.message}
      showPercent={!progress?.prompt}
      action={
        <Button variant="outline" onClick={cancelFirstInstall}>
          {t('common.cancel')}
        </Button>
      }
    />
  )
}

function BootStep(): React.JSX.Element {
  const message = useFirstInstallStore((state) => state.message)
  const portId = useFirstInstallStore((state) => state.portId)
  usePortPolling()
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-200">
        {message}
      </p>
      <PortChoice />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={closeFirstInstall}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!portId} onClick={() => void startFirstInstall(true)}>
          {t('firmware.firstInstall.tryAgain')}
        </Button>
      </div>
    </div>
  )
}

function Finished(): React.JSX.Element {
  const message = useFirstInstallStore((state) => state.message)
  return (
    <div className="space-y-3">
      <p>{message}</p>
      <div className="flex justify-end">
        <Button onClick={closeFirstInstall}>{t('common.close')}</Button>
      </div>
    </div>
  )
}

function Failed(): React.JSX.Element {
  const message = useFirstInstallStore((state) => state.message)
  return (
    <div className="space-y-3">
      <p className="text-red-400">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={closeFirstInstall}>
          {t('common.close')}
        </Button>
        <Button onClick={returnToChoice}>{t('firmware.firstInstall.tryAgain')}</Button>
      </div>
    </div>
  )
}
