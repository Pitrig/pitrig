import { controlCommandRefusal, type ControlCommandValue, type SerialTrafficLog } from '../../shared/debug'
import type {
  DeviceConfigurationResetResult,
  DeviceConfigurationApplyResult,
  DeviceConfigurationSaveResult,
  DeviceResult,
  DeviceState,
  SerialPortSummary
} from '../../shared/device'
import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { FontUploadProgress } from '../../shared/font-assets'
import { failure, success, toDeviceError } from './device-errors'
import {
  applyDeviceConfiguration,
  readDeviceConfiguration,
  resetDeviceConfiguration,
  saveDeviceConfiguration
} from './device-config-commands'
import { ConnectionManager } from './device-connection'
import { OperationRunner } from './device-operation'
import { closePort } from './serial-port-lifecycle'
import {
  advanceFirmwareSession,
  advanceFontSession,
  advanceImageSession,
  clearFontPackage,
  clearImagePackage,
  uploadPackage
} from './device-uploads'
import { requestResponse, sendControlCommand } from './simcore-protocol'

/**
 * Every command the configurator can ask of a connected board, over the port
 * the ConnectionManager holds and under the OperationRunner's one-at-a-time
 * lock. Splitting those two out left this class the protocol conversations
 * themselves: what is sent, what the reply means for the session, and the
 * ordering rules a save and a reboot impose.
 */
export class DeviceService {
  private readonly connection: ConnectionManager
  private readonly runner: OperationRunner

  constructor(
    onStateChanged: (state: DeviceState) => void,
    onSerialTraffic?: (log: SerialTrafficLog) => void
  ) {
    this.connection = new ConnectionManager(onStateChanged, onSerialTraffic)
    this.runner = new OperationRunner(this.connection)
  }

  getState(): DeviceState {
    return this.connection.getState()
  }

  async listPorts(): Promise<DeviceResult<SerialPortSummary[]>> {
    return this.connection.listPorts()
  }

  async connect(portId: string, baudRate: number): Promise<DeviceResult<DeviceState>> {
    if (this.isBusy()) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    return this.connection.openConnection(portId, baudRate)
  }

  async autoConnect(): Promise<DeviceResult<DeviceState>> {
    if (this.isBusy()) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    return this.connection.autoConnect()
  }

  async cancelAutoConnect(): Promise<DeviceResult<DeviceState>> {
    return this.connection.cancelAutoConnect()
  }

  async disconnect(): Promise<DeviceResult<DeviceState>> {
    if (this.runner.operationActive) {
      return failure({
        code: 'busy',
        message: 'Cancel the active device operation before disconnecting.'
      })
    }
    await this.connection.closeDevicePorts()
    return success(this.getState())
  }

  async readConfiguration(): Promise<DeviceResult<DeviceState>> {
    return readDeviceConfiguration(this.connection, this.runner)
  }

  // Live apply competes with nothing: it is rejected while another device
  // operation holds the lock rather than queued, because the caller sends a
  // fresh document moments later anyway. The pipeline flag is checked here and
  // not in the runner, because a save's own commands run inside it.
  async applyConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    if (this.runner.inPipeline) {
      return failure({ code: 'busy', message: 'A save is running on the connected device.' })
    }
    return this.applyConfigurationNow(json, documents)
  }

  /** The same apply, without the pipeline guard — see applyDeviceConfiguration. */
  async applyConfigurationNow(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    return applyDeviceConfiguration(this.connection, this.runner, json, documents)
  }

  async saveConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
    return saveDeviceConfiguration(this.connection, this.runner, json, documents)
  }

  /** Erases stored configuration — see resetDeviceConfiguration. */
  async resetConfiguration(
    document?: ConfigurationDocumentId
  ): Promise<DeviceResult<DeviceConfigurationResetResult>> {
    return resetDeviceConfiguration(this.connection, this.runner, document)
  }

  /**
   * One line typed by hand, and whatever the board answers.
   *
   * It takes the same operation lock as every other command, so a console
   * cannot interleave itself with a live apply or a save; and it is refused
   * before the lock when the line would open a binary session, because that
   * would leave the router waiting for frames a console cannot send.
   */
  async sendControlCommand(command: string): Promise<DeviceResult<ControlCommandValue>> {
    const refusal = controlCommandRefusal(command)
    if (refusal) return failure({ code: 'invalid_request', message: refusal })
    return this.runner.run(async ({ port, traffic }) => {
      const lines = await sendControlCommand(
        port,
        command.trim(),
        this.runner.operationTraffic(traffic)
      )
      return success({ lines })
    })
  }

  async clearImages(): Promise<DeviceResult<DeviceState>> {
    return clearImagePackage(this.connection, this.runner)
  }

  async clearFonts(): Promise<DeviceResult<DeviceState>> {
    return clearFontPackage(this.connection, this.runner)
  }

  async reboot(): Promise<DeviceResult<DeviceState>> {
    const port = this.connection.port
    const connection = this.getState().connection
    const traffic = this.connection.traffic
    if (!port?.isOpen || !connection || this.runner.operationActive) {
      return failure({ code: 'busy', message: 'The connected device is busy or unavailable.' })
    }
    try {
      return await this.runner.withLock(async () => {
        await requestResponse(
          port,
          '@SC:REBOOT\n',
          '@SC:OK:REBOOTING',
          2_000,
          (direction, data) => {
            // RX is already observed by the active port listener.
            if (direction === 'tx') traffic?.write(direction, data)
          },
          'serial_error'
        )
        const released = this.connection.releaseActivePort()
        await closePort(released?.port ?? port)
        released?.traffic?.flush()
        this.connection.setState({ status: 'disconnected' })
        return success(this.getState())
      })
    } catch (error) {
      return failure(toDeviceError(error))
    }
  }

  async uploadFonts(
    packageBytes: Uint8Array,
    onProgress: (progress: FontUploadProgress) => void,
    signal: AbortSignal,
    /** The package's payload CRC, so a second save this session can skip. */
    payloadCrc?: number
  ): Promise<void> {
    return uploadPackage(
      this.connection,
      this.runner,
      { command: 'FONT', label: 'font' },
      packageBytes,
      onProgress,
      signal,
      (session, bytes) => advanceFontSession(session, bytes, payloadCrc)
    )
  }

  /**
   * Uploads an image package. The device answers a second upload with `busy`
   * while one owns the serial link, and this guard keeps the configurator from
   * asking in the first place.
   */
  async uploadImages(
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal
  ): Promise<void> {
    return uploadPackage(
      this.connection,
      this.runner,
      { command: 'IMAGE', label: 'image' },
      packageBytes,
      onProgress,
      signal,
      advanceImageSession
    )
  }

  /**
   * Uploads an application image into the inactive firmware slot. The device
   * refuses one built for another board, so the package that reaches here
   * already carries the board it was wrapped for.
   */
  async uploadFirmware(
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal
  ): Promise<void> {
    return uploadPackage(
      this.connection,
      this.runner,
      { command: 'FW', label: 'firmware' },
      packageBytes,
      onProgress,
      signal,
      (session) => advanceFirmwareSession(session)
    )
  }

  async dispose(): Promise<void> {
    await this.connection.closeDevicePorts()
  }

  /** See OperationRunner.runPipeline: several commands, nothing in between. */
  async runPipeline<T>(work: () => Promise<T>): Promise<T> {
    return this.runner.runPipeline(work)
  }

  /**
   * Restarts the board and waits for it to come back on the same port.
   *
   * A font package and a saved configuration both become active only after a
   * restart, so this is the last step of a save rather than something the
   * author is asked to remember.
   */
  async rebootAndReconnect(): Promise<DeviceResult<DeviceState>> {
    const connection = this.getState().connection
    const rebooted = await this.reboot()
    if (!rebooted.ok || !connection) return rebooted
    return this.connection.reconnect(connection)
  }

  private isBusy(): boolean {
    return (
      this.runner.operationActive || this.runner.inPipeline || this.connection.isTransitioning()
    )
  }
}
