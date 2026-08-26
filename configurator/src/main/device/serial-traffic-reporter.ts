import type { SerialTrafficLog } from '../../shared/debug'

const MAXIMUM_BUFFERED_TEXT_SIZE = 8_192

export class SerialTrafficReporter {
  private receiveBuffer = ''

  constructor(
    private readonly emit: ((log: SerialTrafficLog) => void) | undefined,
    private readonly path: string,
    private readonly baudRate: number
  ) {}

  write(
    direction: SerialTrafficLog['direction'],
    data: string,
    encoding: SerialTrafficLog['encoding'] = 'utf8'
  ): void {
    if (!this.emit) return
    if (direction === 'tx' || encoding === 'hex') {
      this.emitLog(direction, data, encoding)
      return
    }

    this.receiveBuffer += data
    const lines = this.receiveBuffer.replaceAll('\r', '').split('\n')
    this.receiveBuffer = lines.pop() ?? ''
    for (const line of lines) {
      this.emitLog(direction, line, encoding)
    }

    while (this.receiveBuffer.length > MAXIMUM_BUFFERED_TEXT_SIZE) {
      this.emitLog(
        direction,
        this.receiveBuffer.slice(0, MAXIMUM_BUFFERED_TEXT_SIZE),
        encoding
      )
      this.receiveBuffer = this.receiveBuffer.slice(MAXIMUM_BUFFERED_TEXT_SIZE)
    }
  }

  flush(): void {
    if (!this.emit || this.receiveBuffer.length === 0) return
    this.emitLog('rx', this.receiveBuffer, 'utf8')
    this.receiveBuffer = ''
  }

  private emitLog(
    direction: SerialTrafficLog['direction'],
    data: string,
    encoding: SerialTrafficLog['encoding']
  ): void {
    this.emit?.({ direction, path: this.path, baudRate: this.baudRate, data, encoding })
  }
}
