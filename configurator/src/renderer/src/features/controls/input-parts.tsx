import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { t } from '@shared/ui-text'
import { inputLabel, type InputTarget } from './controls-document'
import { armCapture, sameTarget, useInputTester } from './input-tester'

export function Lamp({ lit }: { lit: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2.5 flex-none rounded-full transition-colors',
        lit ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/70' : 'bg-white/15'
      )}
    />
  )
}

export function InputChip({
  id,
  lit,
  onRemove
}: {
  id: string
  lit: boolean
  onRemove: () => void
}): React.JSX.Element {
  return (
    <span
      title={id}
      className={cn(
        'flex max-w-56 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]',
        lit ? 'border-emerald-400/60 text-emerald-300' : 'text-muted-foreground'
      )}
    >
      <span className="truncate">{inputLabel(id)}</span>
      <button
        type="button"
        aria-label={t('controls.inputParts.removeInput', { input: id })}
        className="flex-none hover:text-foreground"
        onClick={onRemove}
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  )
}

export function CaptureButton({
  target,
  disabled,
  title,
  label = t('controls.inputParts.assign')
}: {
  target: InputTarget
  disabled?: boolean
  title?: string
  label?: string
}): React.JSX.Element {
  const armed = useInputTester((state) => sameTarget(state.capture, target))
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={cn(
        'h-6 flex-none rounded-md border px-2 text-[11px] disabled:opacity-40',
        armed
          ? 'animate-pulse border-sky-400 bg-sky-400/10 text-sky-300'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      )}
      onClick={() => armCapture(armed ? undefined : target)}
    >
      {armed ? t('controls.inputParts.pressAButton') : label}
    </button>
  )
}
