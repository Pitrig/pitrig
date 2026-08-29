import bebasNeue from './bundled/bebas-neue.ttf?asset'
import materialIcons from './bundled/material-icons.ttf?asset'
import oxaniumBold from './bundled/oxanium_bold.ttf?asset'
import roboto from './bundled/roboto.ttf?asset'
import robotoBlack from './bundled/roboto_black.ttf?asset'
import robotoBold from './bundled/roboto_bold.ttf?asset'
import robotoCondensedBold from './bundled/roboto-condensed_bold.ttf?asset'
import robotoMono from './bundled/roboto-mono.ttf?asset'
import titilliumWebBold from './bundled/titillium-web_bold.ttf?asset'

import type { FontVariant } from '../../shared/font-library'

export interface BundledFace {
  id: string
  name: string
  category: string
  family: string
  variant: FontVariant
  path: string
}

export const BUNDLED_FACES: readonly BundledFace[] = [
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'Sans Serif',
    family: 'Roboto',
    variant: '400',
    path: roboto
  },
  {
    id: 'roboto_bold',
    name: 'Roboto Bold',
    category: 'Sans Serif',
    family: 'Roboto',
    variant: '700',
    path: robotoBold
  },
  {
    id: 'roboto_black',
    name: 'Roboto Black',
    category: 'Sans Serif',
    family: 'Roboto',
    variant: '900',
    path: robotoBlack
  },
  {
    id: 'roboto-condensed_bold',
    name: 'Roboto Condensed Bold',
    category: 'Sans Serif',
    family: 'Roboto Condensed',
    variant: '700',
    path: robotoCondensedBold
  },
  {
    id: 'roboto-mono',
    name: 'Roboto Mono',
    category: 'Monospace',
    family: 'Roboto Mono',
    variant: '400',
    path: robotoMono
  },
  {
    id: 'titillium-web_bold',
    name: 'Titillium Web Bold',
    category: 'Sans Serif',
    family: 'Titillium Web',
    variant: '700',
    path: titilliumWebBold
  },
  {
    id: 'oxanium_bold',
    name: 'Oxanium Bold',
    category: 'Display',
    family: 'Oxanium',
    variant: '700',
    path: oxaniumBold
  },
  {
    id: 'material-icons',
    name: 'Material Icons',
    category: 'Icons',
    family: 'Material Icons',
    variant: '400',
    path: materialIcons
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'Display',
    family: 'Bebas Neue',
    variant: '400',
    path: bebasNeue
  }
]
