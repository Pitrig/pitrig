import {
  MAXIMUM_INDICATOR_SEGMENTS,
  type IndicatorSegment,
  type LedFont,
  type RgbColor
} from '@shared/configuration-schema'
import { FLAGS_PROFILE } from './flags'
import { area, whenTrue, type LedProfile, type MatrixSize } from './profile-types'
import { t } from '@shared/ui-text'

export type { LampRange, LedProfile, MatrixSize, ProfileParts } from './profile-types'

const SHIFT_FIRST = 0.7
const SHIFT_LAST = 0.97
const SHIFT_RAMP: readonly RgbColor[] = ['#00C853', '#FFD600', '#FF2D95']
const GEAR_CAUTION = 90
const GEAR_LIMIT = 97

function mix(left: RgbColor, right: RgbColor, amount: number): RgbColor {
  const channel = (at: number): string => {
    const from = Number.parseInt(left.slice(at, at + 2), 16)
    const to = Number.parseInt(right.slice(at, at + 2), 16)
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}` as RgbColor
}

function rampAt(position: number): RgbColor {
  const span = SHIFT_RAMP.length - 1
  const scaled = Math.min(Math.max(position, 0), 1) * span
  const index = Math.min(Math.floor(scaled), span - 1)
  return mix(SHIFT_RAMP[index] as RgbColor, SHIFT_RAMP[index + 1] as RgbColor, scaled - index)
}

function gearFace(matrix: MatrixSize | undefined): LedFont {
  if (matrix !== undefined && matrix.height >= 8 && matrix.width >= 6) return 'bold_6x8'
  return 'bold_4x6'
}

function shiftSteps(lamps: number): IndicatorSegment[] {
  const count = Math.min(Math.max(lamps, 1), MAXIMUM_INDICATOR_SEGMENTS)
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0 : index / (count - 1)
    return {
      threshold: Number((SHIFT_FIRST + (SHIFT_LAST - SHIFT_FIRST) * position).toFixed(4)),
      color: rampAt(position)
    }
  })
}

export const LED_PROFILES: readonly LedProfile[] = [
  {
    id: 'shift_lights',
    label: t('modules.profiles.shiftLights'),
    description:
      t('modules.profiles.oneStepPerLampFrom'),
    build: (range, lamps) => ({
      effects: [
        {
          type: 'steps',
          id: 'Shift lights',
          ...area(range),
          source: { binding: 'engine.rpm_percent' },
          minimum: 0,
          maximum: 100,
          steps: shiftSteps(lamps)
        },
        {
          type: 'solid',
          id: 'Limiter',
          color: '#D50000',
          blink_ms: 150,
          ...area(range),
          gate: 'conditions',
          condition_source: { binding: 'engine.rpm_percent' },
          conditions: [{ op: 'at_or_above', value: 97 }]
        }
      ]
    })
  },
  FLAGS_PROFILE,
  {
    id: 'gear',
    label: t('modules.profiles.gear'),
    panelOnly: true,
    description:
      t('modules.profiles.theSelectedGearDrawnIn'),
    build: (range, _lamps, matrix) => ({
      effects: [
        {
          type: 'text',
          id: 'Gear',
          font: gearFace(matrix),
          color: '#FFFFFF',
          source: { binding: 'transmission.gear' },
          condition_source: { binding: 'engine.rpm_percent' },
          color_rules: [
            { op: 'at_or_above', value: GEAR_LIMIT, color: '#D50000' },
            { op: 'at_or_above', value: GEAR_CAUTION, color: '#FFD600' }
          ],
          ...area(range)
        }
      ]
    })
  },
  {
    id: 'abs_active',
    label: t('modules.profiles.aBS'),
    description: t('modules.profiles.redFlashWhileAbsIs'),
    build: (range) => ({
      effects: [
        {
          type: 'solid',
          id: 'ABS',
          color: '#D50000',
          blink_ms: 150,
          hold_ms: 150,
          ...area(range),
          ...whenTrue('vehicle.aids.abs_active')
        }
      ]
    })
  },
  {
    id: 'tc_active',
    label: t('modules.profiles.tractionControl'),
    description: t('modules.profiles.orangeFlashWhileTractionControl'),
    build: (range) => ({
      effects: [
        {
          type: 'solid',
          id: 'Traction',
          color: '#FF6D00',
          blink_ms: 150,
          hold_ms: 150,
          ...area(range),
          ...whenTrue('vehicle.aids.traction_control_active')
        }
      ]
    })
  },
  {
    id: 'pit_limiter',
    label: t('modules.profiles.pitLimiter'),
    description: t('modules.profiles.steadyBlueWhileTheLimiter'),
    build: (range) => ({
      effects: [
        {
          type: 'solid',
          id: 'Pit limiter',
          color: '#2979FF',
          ...area(range),
          ...whenTrue('vehicle.pit_limiter.enabled')
        }
      ]
    })
  },
  {
    id: 'drs',
    label: t('modules.profiles.dRS'),
    description: t('modules.profiles.dimGreenWhenAvailableBright'),
    build: (range) => ({
      effects: [
        {
          type: 'solid',
          id: 'DRS available',
          color: '#1B5E20',
          ...area(range),
          ...whenTrue('vehicle.drs.available')
        },
        {
          type: 'solid',
          id: 'DRS active',
          color: '#00E676',
          ...area(range),
          ...whenTrue('vehicle.drs.active')
        }
      ]
    })
  },
  {
    id: 'idle',
    label: t('modules.profiles.linkLost'),
    description: t('modules.profiles.aSlowRainbowOnceTelemetry'),
    build: (range) => ({
      effects: [
        {
          type: 'animation',
          id: 'Link lost',
          animation: 'rainbow',
          speed_ms: 4000,
          gate: 'telemetry_idle',
          ...area(range)
        }
      ]
    })
  }
]
