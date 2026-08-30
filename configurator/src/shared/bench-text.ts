import { allWidgetsOf } from './configuration-access'
import type { ApplicationConfiguration, DashboardDocument } from './configuration-schema'

const RUNTIME_VALUE_CHARACTERS = '0123456789.:-+%'

export function benchTextCharacters(document: DashboardDocument): string {
  const characters = new Set<string>(RUNTIME_VALUE_CHARACTERS)
  const add = (text: string | undefined): void => {
    for (const character of text ?? '') characters.add(character)
  }
  for (const widget of allWidgetsOf(document as ApplicationConfiguration)) {
    add(widget.title?.text)
    if (widget.type === 'text') {
      add(widget.value?.unavailable_text)
      for (const source of widget.sources ?? []) {
        add(source.transform?.prefix)
        add(source.transform?.suffix)
      }
    }
  }
  characters.delete(' ')
  return [...characters].join('')
}
