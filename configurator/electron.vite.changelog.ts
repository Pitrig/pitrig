import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type {
  FirmwareChange,
  FirmwareChangeKind,
  FirmwareChangeRelease,
  FirmwareChangeScope
} from './src/shared/firmware-changes'

const CHANGELOG = resolve('../CHANGELOG.md')

const BOARD_SCOPES: Record<string, FirmwareChangeScope> = {
  'All boards': 'all',
  'Display boards': 'display',
  'LilyGO T-Display-S3': 't_display_s3',
  'Guition ESP32-4848S040': 'guition_esp32_4848s040',
  'Guition JC1060P470C': 'guition_jc1060p470c',
  'Espressif ESP32-S3-DevKitC-1': 'esp32s3_devkit'
}

const OTHER_SCOPES = new Set(['Configurator', 'SimHub plugin', 'Development'])

const KINDS: Record<string, FirmwareChangeKind> = {
  '**Added**': 'added',
  '**Changed**': 'changed',
  '**Fixed**': 'fixed',
  '**Removed**': 'removed'
}

const HEADING = /^## (Unreleased|(\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}(?: — firmware (\d+\.\d+\.\d+))?)$/
const GROUP = /^\*\*[^*]+\*\*$/
const LABEL = /^\*\*([^*]+)\.\*\* (.+)$/s

interface Entry {
  line: number
  kind: FirmwareChangeKind
  text: string
}

interface Section {
  line: number
  version: string
  firmware?: string
  labelled: boolean
  entries: Entry[]
}

export function readFirmwareChanges(): FirmwareChangeRelease[] {
  const sections = sectionsOf(readFileSync(CHANGELOG, 'utf8')).filter(
    (section) => section.labelled
  )
  const releases = sections.map(releaseOf)
  releases.forEach((release, index) => {
    const repeated =
      release.firmware !== undefined && release.firmware === releases[index + 1]?.firmware
    if (repeated && release.changes.length > 0) {
      fail(
        sections[index]?.line ?? 0,
        `${release.version} ships firmware ${release.firmware} again but lists board changes`
      )
    }
  })
  return releases.filter((release) => release.changes.length > 0)
}

function sectionsOf(text: string): Section[] {
  const sections: Section[] = []
  let kind: FirmwareChangeKind | undefined
  let entry: Entry | undefined
  text.split('\n').forEach((raw, index) => {
    const line = index + 1
    const heading = raw.startsWith('## ') ? HEADING.exec(raw) : undefined
    if (raw.startsWith('## ') && !heading) fail(line, `unreadable heading "${raw}"`)
    const section = sections.at(-1)
    if (heading) {
      const unreleased = heading[1] === 'Unreleased'
      sections.push({
        line,
        version: unreleased ? 'Unreleased' : heading[2]!,
        ...(heading[3] ? { firmware: heading[3] } : {}),
        labelled: unreleased || heading[3] !== undefined,
        entries: []
      })
      kind = undefined
      entry = undefined
    } else if (!section) {
      return
    } else if (KINDS[raw.trim()]) {
      kind = KINDS[raw.trim()]
      entry = undefined
    } else if (section.labelled && GROUP.test(raw)) {
      fail(line, `"${raw}" is not Added, Changed, Fixed or Removed`)
    } else if (raw.startsWith('- ') && section.labelled) {
      if (!kind) fail(line, 'an entry before any Added, Changed, Fixed or Removed')
      entry = { line, kind, text: raw.slice(2) }
      section.entries.push(entry)
    } else if (raw.startsWith('  ') && entry) {
      entry.text += ` ${raw.trim()}`
    } else {
      entry = undefined
    }
  })
  return sections
}

function releaseOf(section: Section): FirmwareChangeRelease {
  const changes: FirmwareChange[] = []
  for (const entry of section.entries) {
    const label = LABEL.exec(entry.text)
    if (!label) fail(entry.line, 'the entry opens with no bold label such as **All boards.**')
    const names = label[1]!.split(', ')
    const scopes: FirmwareChangeScope[] = []
    for (const name of names) {
      const scope = BOARD_SCOPES[name]
      if (scope) scopes.push(scope)
      else if (!OTHER_SCOPES.has(name)) fail(entry.line, `unknown label "${name}"`)
    }
    if (scopes.length > 0) changes.push({ kind: entry.kind, scopes, text: label[2]! })
  }
  return {
    version: section.version,
    ...(section.firmware ? { firmware: section.firmware } : {}),
    changes
  }
}

function fail(line: number, message: string): never {
  throw new Error(`CHANGELOG.md line ${line}: ${message}`)
}
