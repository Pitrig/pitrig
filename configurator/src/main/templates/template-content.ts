import { documentOf } from '../../shared/configuration-documents'
import type { DeviceConfiguration } from '../../shared/device'
import {
  TEMPLATE_FORMAT,
  TEMPLATE_FORMAT_VERSION,
  WIDGET_TEMPLATE_FORMAT,
  type DashboardTemplateDocument,
  type TemplateDocument,
  type TemplateKind,
  type TemplateSaveRequest,
  type WidgetTemplateDocument
} from '../../shared/templates'
import {
  templateOf,
  wrongTemplate,
  type DashboardFileHeader
} from '../dashboard-files/dashboard-file-format'
import type { DashboardFileDraft } from '../dashboard-files/dashboard-file-service'
import {
  carriedWidget,
  parseDeviceConfigurationValue,
  widgetCarrier
} from '../device/configuration-json'
import { parseTemplateDocument, parseWidgetTemplateDocument } from './template-documents'

export function documentFromFile(header: DashboardFileHeader, kind: TemplateKind): TemplateDocument {
  if (templateOf(header) !== kind) throw new Error(wrongTemplate(templateOf(header)))
  const envelope = {
    format_version: TEMPLATE_FORMAT_VERSION,
    name: header.name,
    ...(header.description ? { description: header.description } : {})
  }
  if (kind === 'dashboard') {
    return parseTemplateDocument({
      ...envelope,
      format: TEMPLATE_FORMAT,
      configuration: header.configuration
    })
  }
  const carrier = parseDeviceConfigurationValue(header.configuration)
  return parseWidgetTemplateDocument({
    ...envelope,
    format: WIDGET_TEMPLATE_FORMAT,
    board: carrier.board,
    widget: carriedWidget(carrier)
  })
}

export function documentFromRequest(
  request: TemplateSaveRequest,
  name: string,
  description: string | undefined
): TemplateDocument {
  const envelope = {
    format_version: TEMPLATE_FORMAT_VERSION,
    name,
    ...(description ? { description } : {})
  }
  return request.kind === 'dashboard'
    ? parseTemplateDocument({
        ...envelope,
        format: TEMPLATE_FORMAT,
        configuration: JSON.parse(request.json)
      })
    : parseWidgetTemplateDocument({
        ...envelope,
        format: WIDGET_TEMPLATE_FORMAT,
        board: request.board,
        widget: JSON.parse(request.json)
      })
}

export function documentFromLegacy(bytes: Buffer, kind: TemplateKind): TemplateDocument {
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  return kind === 'dashboard' ? parseTemplateDocument(value) : parseWidgetTemplateDocument(value)
}

export function draftOf(document: TemplateDocument): DashboardFileDraft {
  return {
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    configuration: carrierOf(document),
    ...(document.format === WIDGET_TEMPLATE_FORMAT ? { template: 'widget' as const } : {})
  }
}

export function carrierOf(document: TemplateDocument): DeviceConfiguration {
  return document.format === TEMPLATE_FORMAT
    ? documentOf(document.configuration, 'dashboard')
    : widgetCarrier(document.widget, document.board)
}

export function isDashboardDocument(
  document: TemplateDocument
): document is DashboardTemplateDocument {
  return document.format === TEMPLATE_FORMAT
}

export function isWidgetDocument(document: TemplateDocument): document is WidgetTemplateDocument {
  return document.format === WIDGET_TEMPLATE_FORMAT
}
