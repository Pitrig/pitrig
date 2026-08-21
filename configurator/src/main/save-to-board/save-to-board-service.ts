import { canonicalJson } from '../../shared/configuration-access'
import { documentFonts } from '../../shared/document-fonts'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from '../../shared/save-to-board'
import type { DeviceSession } from '../../shared/device'
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
 * bytes, and saves the configuration.
 *
 * How it finishes depends on what it did. A font package becomes usable only
 * after a restart, so installing one ends in a restart and a reconnection — ten
 * seconds of a dark screen, which is worth paying for a face the board cannot
 * otherwise rasterize. A configuration does not need one: `@SC:APPLY` rebuilds
 * the running dashboard from the same document that was just written to NVS,
 * which is what the live preview does on every keystroke. Saving therefore
 * restarts the board only when a restart buys something.
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

      // Anything the board is still owed a restart for makes the restart worth
      // taking now: a face or a bitmap it has accepted but not yet mapped is one
      // the dashboard about to be applied would draw wrong. So does a changed
      // transport — the firmware stores it and takes the full recompose path,
      // but recompose rebuilds modules and the dashboard, and the link itself is
      // selected once at startup. Saving without restarting would leave the
      // author looking at a setting that has been written and is not in force.
      const restartNeeded =
        fontsUploaded ||
        assetsAwaitingRestart(this.deviceService.getState().session) ||
        transportChanged(session, request.json)
      if (restartNeeded) {
        const reconnected = await this.restart()
        this.report('completed', 1, 1, 'Saved. The board is running the new dashboard.')
        return {
          ok: true,
          value: {
            configuration: saved.value.configuration,
            fontsUploaded,
            restarted: true,
            ...(reconnected.ok ? {} : { reconnectFailed: true })
          }
        }
      }

      this.report('applying', 0, 1, 'Applying to the running dashboard')
      const applied = await this.deviceService.applyConfigurationNow(request.json)
      this.report('completed', 1, 1, 'Saved. The board is running the new dashboard.')
      return {
        ok: true,
        value: {
          configuration: saved.value.configuration,
          fontsUploaded,
          restarted: false,
          // Flash is already written, so a refused apply is a note: the board
          // keeps showing what it showed, and starts with the saved document.
          ...(applied.ok ? {} : { applyFailed: applied.error.message })
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

/**
 * Whether the document changes the link the board talks over.
 *
 * Compared against what the board reported when it was read, structurally, so
 * reordering or reformatting the section is not a change. A document that
 * cannot be parsed is not a transport change — the save is about to fail on it
 * anyway, and the parse error is the better message.
 */
function transportChanged(session: DeviceSession, json: string): boolean {
  try {
    return (
      canonicalJson(parseDeviceConfigurationJson(json).telemetry_transport) !==
      canonicalJson(session.configuration.telemetry_transport)
    )
  } catch {
    return false
  }
}

/**
 * Whether the board is holding an asset package it has accepted but cannot use
 * until it restarts. Fonts and images both report this, and both change what the
 * dashboard draws, so either is reason enough to take the restart with the save.
 */
function assetsAwaitingRestart(session: DeviceSession | undefined): boolean {
  return Boolean(session?.fontAssets?.rebootRequired || session?.imageAssets?.rebootRequired)
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
