import type { WidgetSelection } from '../dashboard-editor'

// The selection as one <select> value and back. A screen and a widget share the
// dropdown, so they share one encoding; kept out of the field components so
// those export components only.

export function selectionValue(selection: WidgetSelection | undefined): string { return selection?.type === 'screen' ? 'screen' : selection?.type === 'widget' ? `widget:${selection.id}` : '' }
export function parseSelection(value: string): WidgetSelection | undefined { if (value === 'screen') return { type: 'screen' }; if (value.startsWith('widget:')) return { type: 'widget', id: value.slice(7) }; return undefined }
