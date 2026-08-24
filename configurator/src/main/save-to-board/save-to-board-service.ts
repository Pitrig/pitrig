import { documentFonts } from '../../shared/document-fonts'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  documentsDiffering
} from '../../shared/configuration-documents'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from '../../shared/save-to-board'
import type {
  DeviceConfiguration,
  DeviceConfigurationSaveResult,
  DeviceSession
} from '../../shared/device'
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

    // Parsed once, up front, whatever is about to be written. Working out which
    // documents differ needs the structure anyway, and a document that does not
    // parse has to fail here rather than reach the "nothing differs" branch and
    // be reported as a save that succeeded.
    let configuration: DeviceConfiguration
    try {
      configuration = parseDeviceConfigurationJson(request.json)
    } catch (error) {
      return failure('invalid_configuration', messageOf(error, 'The configuration is not valid.'))
    }

    const requested = request.documents
    const changed = documentsDiffering(configuration, session.configuration).filter(
      (document) => requested === undefined || requested.includes(document)
    )

    // A board in safe mode runs no upload engine, so there is no package to
    // build and no question to ask about a family: writing the document is the
    // whole errand, and it is the errand that gets the board out of safe mode.
    const safeMode = session.info.health?.safeMode ?? false

    // Fonts belong to the dashboard document. A save that is not writing it —
    // the Configs page saving one row, or a dashboard that already matches the
    // board — has no faces to resolve and no package to build, and asking the
    // author about a family it is not about to send would be a question with
    // nothing behind it.
    const families =
      !safeMode && changed.includes('dashboard') ? requiredFamilies(configuration) : []

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

      // Only what actually differs from the board is written — worked out above,
      // before the pipeline was taken. The three documents are stored separately
      // now, so changing a baud rate no longer rewrites sixty kilobytes of
      // dashboard, and a dashboard edit no longer makes the board answer that a
      // restart is owed for a transport nobody touched.
      let written: DeviceConfigurationSaveResult | undefined
      if (changed.length > 0) {
        this.report('saving', 0, 1, describeSaving(changed))
        const result = await this.deviceService.saveConfiguration(request.json, changed)
        if (!result.ok) return failure('device_error', result.error.message)
        written = result.value
      }
      const saved = written?.configuration ?? session.configuration

      // Anything the board is still owed a restart for makes the restart worth
      // taking now: a face or a bitmap it has accepted but not yet mapped is one
      // the dashboard about to be applied would draw wrong. So does the protocol
      // document — the link is selected once at startup, so saving it without
      // restarting would leave the author looking at a setting that has been
      // written and is not in force. The contract answers which documents those
      // are, so this no longer has to compare the transport section by hand.
      //
      // A board in safe mode always takes it. The document just written is what
      // cleared the fault count, and only the boot after it composes anything —
      // safe mode has no dashboard to apply to and registers no apply handler,
      // so the restart is the whole ending rather than an optimisation.
      const leavingSafeMode = safeMode && written !== undefined
      const restartNeeded =
        leavingSafeMode ||
        fontsUploaded ||
        assetsAwaitingRestart(this.deviceService.getState().session) ||
        (written?.rebootRequired ?? false)
      if (restartNeeded) {
        const reconnected = await this.restart()
        this.report(
          'completed',
          1,
          1,
          leavingSafeMode
            ? 'Saved. The board is restarting out of safe mode.'
            : 'Saved. The board is running the new dashboard.'
        )
        return {
          ok: true,
          value: {
            configuration: saved,
            fontsUploaded,
            restarted: true,
            ...(reconnected.ok ? {} : { reconnectFailed: true })
          }
        }
      }

      // Only what was written is applied, and the protocol document is dropped
      // on the way in — it is the one that took the restart branch above.
      const applied =
        written && written.documents.length > 0
          ? await this.deviceService.applyConfigurationNow(request.json, written.documents)
          : undefined
      this.report(
        'completed',
        1,
        1,
        written
          ? 'Saved. The board is running the new dashboard.'
          : 'Nothing to save — the board already holds this configuration.'
      )
      return {
        ok: true,
        value: {
          configuration: saved,
          fontsUploaded,
          restarted: false,
          // Flash is already written, so a refused apply is a note: the board
          // keeps showing what it showed, and starts with the saved document.
          ...(applied && !applied.ok ? { applyFailed: applied.error.message } : {})
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

/** What the progress bar says while one, two or three documents are written. */
function describeSaving(documents: ConfigurationDocumentId[]): string {
  if (documents.length === CONFIGURATION_DOCUMENT_IDS.length) {
    return 'Saving the configuration'
  }
  const names = documents.map((document) =>
    CONFIGURATION_DOCUMENT_LABELS[document].toLowerCase()
  )
  return `Saving the ${names.join(' and ')} configuration`
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
function requiredFamilies(configuration: DeviceConfiguration): string[] {
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
