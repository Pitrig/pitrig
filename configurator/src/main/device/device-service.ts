import { type SerialTrafficLog } from '../../shared/serial-traffic'
import { controlCommandRefusal, type ControlCommandValue } from '../../shared/control-command'
import type {
  DeviceActivity,
  DeviceConnection,
  DeviceConfigurationResetResult,
  DeviceConfigurationApplyResult,
  DeviceConfigurationSaveResult,
  DeviceError,
  DeviceResult,
  DeviceState,
  SerialPortSummary
} from '../../shared/device'
import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { FontUploadProgress } from '../../shared/font-assets'
import type { InstalledImage } from '../../shared/image-assets'
import { DeviceServiceError, failure, success } from './device-errors'
import {
  applyDeviceConfiguration,
  readDeviceConfiguration,
  resetDeviceConfiguration,
  saveDeviceConfiguration,
  validateDeviceConfiguration
} from './device-config-commands'
import { ConnectionManager, type OpenedDevice } from './device-connection'
import { DeviceHeartbeat } from './device-heartbeat'
import { LinkOwner } from './link-owner'
import { claimPortForInstall, type InstallClaim } from './install-claim'
import type { PortClaims } from './port-leases'
import { closePort } from './serial-port-lifecycle'
import { sentTraffic } from './serial-traffic-reporter'
import {
  advanceFirmwareSession,
  advanceFontSession,
  advanceImageSession,
  clearFontPackage,
  clearImagePackage,
  uploadPackage
} from './device-uploads'
import { requestResponse, sendControlCommand, writeDisplayPanel } from './pitrig-protocol'
import { t } from '@shared/ui-text'
import { CONTROL_PREFIX } from '@shared/control-protocol'
import type { DeviceDisplayPanel } from '@shared/display-panel'

const REBOOT_TIMEOUT_MS = 2_000

export class DeviceService {
  private readonly connection: ConnectionManager
  private readonly owner: LinkOwner
  private readonly heartbeat: DeviceHeartbeat

  constructor(
    onStateChanged: (state: DeviceState) => void,
    onSerialTraffic?: (log: SerialTrafficLog) => void
  ) {
    this.connection = new ConnectionManager(onStateChanged, onSerialTraffic)
    this.owner = new LinkOwner(this.connection)
    this.heartbeat = new DeviceHeartbeat(this.connection, this.owner)
    this.heartbeat.start()
  }

  getState(): DeviceState {
    return this.connection.getState()
  }

  attachPortClaims(claims: PortClaims): void {
    this.connection.leases.attach(claims)
  }

  async listPorts(): Promise<DeviceResult<SerialPortSummary[]>> {
    return this.connection.listPorts()
  }

  async connect(portId: string, baudRate: number): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('connect', () => this.connection.openConnection(portId, baudRate))
  }

  async autoConnect(): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('connect', () => this.connection.autoConnect())
  }

  async cancelAutoConnect(): Promise<DeviceResult<DeviceState>> {
    const activity = this.owner.activity
    if (activity !== undefined && activity !== 'connect' && activity !== 'restart') {
      return failure(this.owner.busyWith(activity))
    }
    return this.connection.cancelAutoConnect()
  }

  async disconnect(): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('disconnect', async () => {
      await this.connection.closeDevicePorts()
      return success(this.getState())
    })
  }

  async readConfiguration(): Promise<DeviceResult<DeviceState>> {
    return readDeviceConfiguration(this.connection, this.owner)
  }

  async applyConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    return applyDeviceConfiguration(this.connection, this.owner, json, documents)
  }

  async validateConfiguration(
    json: string,
    documents: ConfigurationDocumentId[]
  ): Promise<DeviceResult<ConfigurationDocumentId[]>> {
    return validateDeviceConfiguration(this.owner, json, documents)
  }

  async saveConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
    return saveDeviceConfiguration(this.connection, this.owner, json, documents)
  }

  async resetConfiguration(
    document?: ConfigurationDocumentId
  ): Promise<DeviceResult<DeviceConfigurationResetResult>> {
    return resetDeviceConfiguration(this.connection, this.owner, document)
  }

  async sendControlCommand(
    command: string,
    options: { poll?: boolean } = {}
  ): Promise<DeviceResult<ControlCommandValue>> {
    const refusal = controlCommandRefusal(command)
    if (refusal) return failure({ code: 'invalid_request', message: refusal })
    const send = async ({ port, traffic }: OpenedDevice): Promise<DeviceResult<ControlCommandValue>> =>
      success({ lines: await sendControlCommand(port, command.trim(), sentTraffic(traffic)) })
    if (!options.poll) return this.owner.command(send)
    return (await this.owner.poll(send)) ?? success({ lines: [] })
  }

  writeTelemetry(text: string | Uint8Array, onWritten?: (error?: Error) => void): boolean {
    const port = this.connection.port
    if (!port || this.connection.isTransitioning()) return false
    return this.owner.writeTelemetry(port, text, onWritten)
  }

  telemetryLinkAvailable(): boolean {
    return Boolean(this.connection.port?.isOpen) && !this.connection.isTransitioning()
  }

  relayAvailable(): boolean {
    return this.telemetryLinkAvailable() && this.owner.free
  }

  async clearImages(): Promise<DeviceResult<DeviceState>> {
    return clearImagePackage(this.connection, this.owner)
  }

  async clearFonts(): Promise<DeviceResult<DeviceState>> {
    return clearFontPackage(this.connection, this.owner)
  }

  async reboot(): Promise<DeviceResult<DeviceState>> {
    return this.owner.command(async ({ port, traffic }) => {
      await requestResponse(
        port,
        `${CONTROL_PREFIX}REBOOT\n`,
        `${CONTROL_PREFIX}OK:REBOOTING`,
        REBOOT_TIMEOUT_MS,
        sentTraffic(traffic),
        'board_refused'
      )
      const released = this.connection.releaseActivePort()
      await closePort(released?.port ?? port)
      released?.traffic?.flush()
      this.connection.setState({ status: 'disconnected' })
      return success(this.getState())
    })
  }

  async uploadFonts(
    packageBytes: Uint8Array,
    onProgress: (progress: FontUploadProgress) => void,
    signal: AbortSignal,
    payloadCrc?: number
  ): Promise<void> {
    return uploadPackage(
      this.connection,
      this.owner,
      { command: 'FONT', label: t('device.deviceService.font') },
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
      this.owner,
      { command: 'IMAGE', label: t('device.deviceService.image') },
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
      this.owner,
      { command: 'FW', label: t('device.deviceService.firmware') },
      packageBytes,
      onProgress,
      signal,
      (session) => advanceFirmwareSession(session)
    )
  }

  async dispose(): Promise<void> {
    this.heartbeat.stop()
    await this.connection.closeDevicePorts()
  }

  async operation<T>(
    activity: DeviceActivity,
    work: () => Promise<T>,
    refused: (error: DeviceError) => T
  ): Promise<T> {
    return this.owner.operation(activity, work, refused)
  }

  whenIdle(): Promise<void> {
    return this.owner.whenIdle()
  }

  async claimForInstall<T>(portId: string, work: (claim: InstallClaim) => Promise<T>): Promise<T> {
    return this.operation(
      'install',
      () => claimPortForInstall(this.connection, portId, work),
      (error) => {
        throw new DeviceServiceError(error.code, error.message)
      }
    )
  }

  async reconnect(connection: DeviceConnection): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('connect', () => this.connection.reconnect(connection))
  }

  async rebootAndReconnect(): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('restart', async () => {
      const connection = this.getState().connection
      const rebooted = await this.reboot()
      if (!rebooted.ok || !connection) return rebooted
      return this.connection.reconnect(connection)
    })
  }

  async setDisplayPanel(panel: DeviceDisplayPanel): Promise<DeviceResult<DeviceState>> {
    return this.stateOperation('restart', async () => {
      const connection = this.getState().connection
      const written = await this.owner.command(async ({ port, traffic }) => {
        await writeDisplayPanel(port, panel, sentTraffic(traffic))
        return success(this.getState())
      })
      if (!written.ok) return written
      const rebooted = await this.reboot()
      if (!rebooted.ok || !connection) return rebooted
      return this.connection.reconnect(connection)
    })
  }

  private async stateOperation(
    activity: DeviceActivity,
    work: () => Promise<DeviceResult<DeviceState>>
  ): Promise<DeviceResult<DeviceState>> {
    return this.owner.operation(activity, work, (error) => failure(error))
  }
}
