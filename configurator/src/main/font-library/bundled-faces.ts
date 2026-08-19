import bebasNeue from './bundled/bebas-neue.ttf?asset'
import oxaniumBold from './bundled/oxanium_bold.ttf?asset'
import roboto from './bundled/roboto.ttf?asset'
import robotoBlack from './bundled/roboto_black.ttf?asset'
import robotoBold from './bundled/roboto_bold.ttf?asset'
import robotoCondensedBold from './bundled/roboto-condensed_bold.ttf?asset'
import robotoMono from './bundled/roboto-mono.ttf?asset'
import titilliumWebBold from './bundled/titillium-web_bold.ttf?asset'

import type { FontVariant } from '../../shared/font-library'

// The faces a fresh installation can already draw with, before any board is
// connected and before anything has been downloaded. They are imported with
// `?asset` rather than inlined the way the bundled templates are: a template is
// a few kilobytes of JSON and a face is a hundred, so electron-vite copies the
// file beside the main bundle and hands back its path instead of putting a
// megabyte of base64 through the module graph.
//
// The ids below are not written by hand — every one is what `fontFamilyId`
// derives from the family and variant beside it. Licences are in
// bundled/OFL.txt.
//
// Every face here draws its ten digits at one width. That is a hard requirement
// for this set rather than a nicety: these are the faces an author reaches for
// first, a dashboard is mostly numbers that change several times a second, and
// a proportional-digit face makes the reading shift sideways as they do. Oswald,
// Rajdhani and Orbitron were here and were dropped for exactly that — Orbitron's
// widest digit is 2.1x its narrowest.

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
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'Display',
    family: 'Bebas Neue',
    variant: '400',
    path: bebasNeue
  }
]
