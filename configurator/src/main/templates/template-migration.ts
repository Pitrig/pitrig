import type { TemplateKind } from '../../shared/templates'
import { decodeDashboardFile } from '../dashboard-files/dashboard-file-format'
import type {
  DashboardFileDraft,
  EncodedDashboardFile
} from '../dashboard-files/dashboard-file-service'
import { documentFromLegacy, draftOf } from './template-content'
import type { TemplateFiles } from './template-files'

const KINDS: readonly TemplateKind[] = ['dashboard', 'widget']

export async function migrateLegacyTemplates(
  files: TemplateFiles,
  encode: (draft: DashboardFileDraft) => Promise<EncodedDashboardFile>
): Promise<void> {
  for (const kind of KINDS) {
    const stored = await files.stored(kind)
    const converted = new Map(
      stored.filter((entry) => entry.format === 'file').map((entry) => [entry.id, entry])
    )
    for (const legacy of stored.filter((entry) => entry.format === 'legacy')) {
      const current = converted.get(legacy.id)
      try {
        if (current && current.modifiedMs >= legacy.modifiedMs) {
          await files.removeFormat(legacy.id, kind, 'legacy')
          continue
        }
        const document = documentFromLegacy(await files.read(legacy, kind), kind)
        const { bytes } = await encode(draftOf(document))
        await decodeDashboardFile(bytes)
        await files.write(legacy.id, kind, bytes)
      } catch {
        continue
      }
    }
  }
}
