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
import type { InstalledImage } from '../../shared/image-assets'
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

  async applyConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    if (this.runner.inPipeline) {
      return failure({ code: 'busy', message: 'A save is running on the connected device.' })
    }
    return this.applyConfigurationNow(json, documents)
  }

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

  async resetConfiguration(
    document?: ConfigurationDocumentId
  ): Promise<DeviceResult<DeviceConfigurationResetResult>> {
    return resetDeviceConfiguration(this.connection, this.runner, document)
  }

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

  writeTelemetry(text: string, onWritten?: (error?: Error) => void): boolean {
    const port = this.connection.port
    if (!port?.isOpen) {
      onWritten?.(new Error('The serial port is closed.'))
      return false
    }
    return port.write(text, (error) => onWritten?.(error ?? undefined))
  }

  telemetryLinkAvailable(): boolean {
    return Boolean(this.connection.port?.isOpen) && !this.connection.isTransitioning()
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

  async uploadImages(
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal,
    installed: readonly InstalledImage[] = []
  ): Promise<void> {
    return uploadPackage(
      this.connection,
      this.runner,
      { command: 'IMAGE', label: 'image' },
      packageBytes,
      onProgress,
      signal,
      (session, bytes) => advanceImageSession(session, bytes, installed)
    )
  }

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

  async runPipeline<T>(work: () => Promise<T>): Promise<T> {
    return this.runner.runPipeline(work)
  }

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
