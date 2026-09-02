import type {
  LedEffect,
  LedSpriteConfiguration,
  RgbColor
} from '@shared/configuration-schema'
import { chequerSprite, diagonalSprite, discSprite } from './matrix-art'
import { area, whenTrue, type LedProfile, type MatrixSize } from './profile-types'
import { t } from '@shared/ui-text'

const RIPPLE_MS = 110
const CHEQUER_MS = 55

interface FlagSpec {
  binding: string
  layer: LedEffect
  art?: (size: MatrixSize) => LedSpriteConfiguration
  speed?: number
  blink?: number
}

function blob(color: RgbColor): LedEffect['stops'] {
  return [
    { at: 0, color: '#050505' },
    { at: 0.5, color },
    { at: 1, color: '#050505' }
  ]
}

const FLAGS: readonly FlagSpec[] = [
  {
    binding: 'session.flag.green',
    layer: { type: 'solid', id: 'Green flag', color: '#00C853', hold_ms: 2000 }
  },
  {
    binding: 'session.flag.white',
    layer: { type: 'solid', id: 'White flag', color: '#F5F5F5', blink_ms: 500 }
  },
  {
    binding: 'session.flag.blue',
    layer: { type: 'solid', id: 'Blue flag', color: '#2962FF', blink_ms: 500 }
  },
  {
    binding: 'session.flag.yellow',
    layer: { type: 'solid', id: 'Yellow flag', color: '#FFD600', blink_ms: 500 }
  },
  {
    binding: 'session.flag.black_white',
    layer: { type: 'gradient', id: 'Warning flag', blink_ms: 800, stops: blob('#FFFFFF') },
    art: ({ width, height }) => diagonalSprite('warning', width, height, '#FFFFFF')
  },
  {
    binding: 'session.flag.black_orange',
    layer: { type: 'gradient', id: 'Meatball', blink_ms: 800, stops: blob('#FF6D00') },
    art: ({ width, height }) => discSprite('meatball', width, height, '#FF6D00'),
    blink: 800
  },
  {
    binding: 'session.flag.checkered',
    layer: {
      type: 'animation',
      id: 'Chequered',
      animation: 'chase',
      speed_ms: 400,
      color: '#FFFFFF'
    },
    art: ({ width, height }) => chequerSprite('chequer', width, height),
    speed: CHEQUER_MS
  },
  {
    binding: 'session.flag.red',
    layer: { type: 'solid', id: 'Red flag', color: '#D50000', blink_ms: 500 }
  }
]

export const FLAGS_PROFILE: LedProfile = {
  id: 'flags',
  label: t('modules.flags.raceFlags'),
  description:
    t('modules.flags.allEightFlagsAtOnce'),
  build: (range, _lamps, matrix) => {
    const sprites: LedSpriteConfiguration[] = []
    const effects = FLAGS.map(({ binding, layer, art, speed, blink }) => {
      if (matrix === undefined || art === undefined) {
        return { ...layer, ...area(range), ...whenTrue(binding) }
      }
      const sprite = art(matrix)
      sprites.push(sprite)
      return {
        type: 'sprite' as const,
        id: layer.id,
        sprite: sprite.id,
        sprite_loop: true,
        speed_ms: speed ?? RIPPLE_MS,
        ...(blink === undefined ? {} : { blink_ms: blink }),
        ...whenTrue(binding)
      }
    })
    return { effects, sprites }
  }
}
