import { documentFonts } from '../../shared/document-fonts'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from '../../shared/save-to-board'
import { DeviceService } from '../device/device-service'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import { FontAssetService } from '../font-assets/font-asset-service'
import { FontLibraryService } from '../font-library/font-library-service'

/**
 * "Save to board" as one sequence rather than as a handful of buttons.
 *
 * The author's act is *save the dashboard*; the fonts it needs are a
 * consequence of what they chose, not a separate errand. So this resolves the
 * families the document names against the library, builds the package the board
 * would need, sends it only when the board does not already hold those exact
 * bytes, saves the configuration, and restarts — because a font package and a
 * saved configuration both become active only after a restart.
 *
 * It stops before writing anything when a family cannot be resolved. That is
 * the one question only the author can answer, and asking it after half the
 * flash is written would leave a board the document no longer matches.
 */
export class SaveToBoardService {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly fontAssets: FontAssetService,
    private readonly library: FontLibraryService,
    private readonly onProgress: (progress: SaveProgress) => void
  ) {}

  async save(request: SaveToBoardRequest): Promise<SaveToBoardResult> {
    const session = this.deviceService.getState().session
    if (!session) {
      return failure('device_error', 'No SimCore board is connected.')
    }

    let families: string[]
    try {
      families = requiredFamilies(request.json)
    } catch (error) {
      return failure('invalid_configuration', messageOf(error, 'The configuration is not valid.'))
    }

    this.report('preparing', 0, 1, 'Checking the fonts this dashboard needs')
    const unresolved = await this.library.unresolved(families)
    if (unresolved.length > 0) {
      return {
        ok: false,
        error: {
          code: 'fonts_unresolved',
          families: unresolved,
          message:
            unresolved.length === 1
              ? `The font library has no face called "${unresolved[0]}".`
              : `The font library has no face for ${unresolved.length} of this dashboard's families.`
        }
      }
    }

    return this.deviceService.runPipeline(async () => {
      let fontsUploaded = false
      if (families.length > 0 && session.fontAssets?.storageAvailable) {
        this.report('building', 0, 1, 'Building the font package')
        const built = await this.fontAssets.buildPackage(families)
        if (!built.ok) return failure('font_upload_failed', built.error.message)

        // Skipping is worth this much care: a face is hundreds of kilobytes over
        // a stop-and-wait serial link, and sending one the board already has
        // also costs a restart. The CRC covers the face data only, so the family
        // list answers for the manifest — see docs/font-assets.md.
        const installed = session.fontAssets
        const sameBytes =
          installed.packageAvailable &&
          installed.payloadCrc !== undefined &&
          installed.payloadCrc === built.value.payloadCrc &&
          sameFamilies(installed.families, built.value.families)

        if (!sameBytes) {
          // A board still owing a restart for an earlier font change refuses a
          // second one, so it takes its restart first rather than failing here.
          if (installed.rebootRequired) {
            const restarted = await this.restart()
            if (!restarted.ok) return restarted.error
          }
          const uploaded = await this.fontAssets.upload({ families }, this.forwardUploadProgress)
          if (!uploaded.ok) return failure('font_upload_failed', uploaded.error.message)
          fontsUploaded = true
        }
      }

      this.report('saving', 0, 1, 'Saving the configuration')
      const saved = await this.deviceService.saveConfiguration(request.json)
      if (!saved.ok) return failure('device_error', saved.error.message)

      const reconnected = await this.restart()
      this.report('completed', 1, 1, 'Saved. The board is running the new dashboard.')
      return {
        ok: true,
        value: {
          configuration: saved.value.configuration,
          fontsUploaded,
          ...(reconnected.ok ? {} : { reconnectFailed: true })
        }
      }
    })
  }

  /** The upload engine's own numbers, forwarded as one stage of this sequence. */
  private readonly forwardUploadProgress = (progress: AssetUploadProgress): void => {
    this.report('uploading', progress.completed, progress.total, progress.message)
  }

  private async restart(): Promise<{ ok: true } | { ok: false; error: SaveToBoardResult }> {
    this.report('rebooting', 0, 1, 'Restarting the board')
    const result = await this.deviceService.rebootAndReconnect()
    if (result.ok) return { ok: true }
    // Flash is already written, so a board that does not come back is a note
    // rather than a failed save. The caller decides how to say so.
    this.report('reconnecting', 0, 1, result.error.message)
    return { ok: false, error: failure('device_error', result.error.message) }
  }

  private report(
    stage: SaveProgress['stage'],
    completed: number,
    total: number,
    message: string
  ): void {
    this.onProgress({ stage, completed, total, message })
  }
}

/** The families a document names, deduplicated and in a stable order. */
function requiredFamilies(json: string): string[] {
  const configuration = parseDeviceConfigurationJson(json)
  return [
    ...new Set(
      documentFonts(configuration)
        .map((font) => font?.family)
        .filter((family): family is string => Boolean(family))
    )
  ].sort()
}

function sameFamilies(installed: readonly string[], wanted: readonly string[]): boolean {
  if (installed.length !== wanted.length) return false
  const sorted = [...installed].sort()
  return [...wanted].sort().every((family, index) => sorted[index] === family)
}

function failure(
  code: 'invalid_configuration' | 'busy' | 'device_error' | 'font_upload_failed',
  message: string
): SaveToBoardResult {
  return { ok: false, error: { code, message } }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
