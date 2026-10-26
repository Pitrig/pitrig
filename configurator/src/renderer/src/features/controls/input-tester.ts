import { useEffect } from 'react'
import { create } from 'zustand'

import type { InputButton, InputSource } from '@shared/configuration-schema'
import type { PluginInput } from '@shared/telemetry-bridge'
import { telemetryBridge } from '@/features/telemetry/bridge-store'
import { assignInput, type InputTarget } from './controls-document'

const HIT_MS = 300

interface InputTesterState {
  latest: PluginInput | undefined
  lastInput: { name: string; down: boolean } | undefined
  hits: Readonly<Record<string, number>>
  actionHits: Readonly<Record<number, number>>
  capture: InputTarget | undefined
  watchers: number
  tick: number
}

export const useInputTester = create<InputTesterState>(() => ({
  latest: undefined,
  lastInput: undefined,
  hits: {},
  actionHits: {},
  capture: undefined,
  watchers: 0,
  tick: 0
}))

export function armCapture(target: InputTarget | undefined): void {
  useInputTester.setState({ capture: target })
}

export function sameTarget(left: InputTarget | undefined, right: InputTarget): boolean {
  return left?.kind === right.kind && left.index === right.index
}

export function useInputTesterFeed(): void {
  useEffect(() => {
    useInputTester.setState((state) => ({ watchers: state.watchers + 1 }))
    const unsubscribe = telemetryBridge().onInput(receive)
    return () => {
      unsubscribe()
      useInputTester.setState((state) => ({ watchers: state.watchers - 1, capture: undefined }))
    }
  }, [])
}

function receive(input: PluginInput): void {
  const now = performance.now()
  const state = useInputTester.getState()
  const next: Partial<InputTesterState> = { latest: input }
  if (input.input !== undefined && input.down !== undefined) {
    next.lastInput = { name: input.input, down: input.down }
    if (input.down) next.hits = { ...state.hits, [input.input]: now }
  }
  if (input.action !== undefined && input.down) {
    next.actionHits = { ...state.actionHits, [input.action]: now }
  }
  if (state.capture && input.input !== undefined && input.down) {
    assignInput(state.capture, input.input)
    next.capture = undefined
  }
  useInputTester.setState(next)
  window.setTimeout(() => useInputTester.setState((current) => ({ tick: current.tick + 1 })), HIT_MS)
}

function recent(at: number | undefined): boolean {
  return at !== undefined && performance.now() - at < HIT_MS
}

function held(state: InputTesterState, id: string | undefined): boolean {
  if (!id) return false
  return (state.latest?.pressed.includes(id) ?? false) || recent(state.hits[id])
}

export function buttonLit(state: InputTesterState, index: number, button: InputButton | undefined): boolean {
  if (((state.latest?.actions ?? 0) >>> index) & 1) return true
  if (recent(state.actionHits[index + 1])) return true
  return (button?.sources ?? []).some((source) => held(state, source.id))
}

export function inputLit(state: InputTesterState, id: string | undefined): boolean {
  return held(state, id)
}

export function selectedPosition(state: InputTesterState, positions: readonly InputSource[]): number {
  let selected = -1
  let latest = Number.NEGATIVE_INFINITY
  for (const [index, position] of positions.entries()) {
    const at = position.id ? state.hits[position.id] : undefined
    if (at !== undefined && at > latest) {
      latest = at
      selected = index
    }
  }
  return selected
}
