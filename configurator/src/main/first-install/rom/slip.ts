const END = 0xc0
const ESC = 0xdb
const ESC_END = 0xdc
const ESC_ESC = 0xdd
const RESPONSE_DIRECTION = 0x01
const FRAME_LIMIT = 0x4000

export function encodeSlip(payload: Uint8Array): Buffer {
  const out = Buffer.allocUnsafe(payload.length * 2 + 2)
  let length = 0
  out[length++] = END
  for (const byte of payload) {
    if (byte === END) {
      out[length++] = ESC
      out[length++] = ESC_END
    } else if (byte === ESC) {
      out[length++] = ESC
      out[length++] = ESC_ESC
    } else {
      out[length++] = byte
    }
  }
  out[length++] = END
  return out.subarray(0, length)
}

export class SlipDecoder {
  private frame: number[] | undefined
  private escaped = false

  constructor(private readonly onFrame: (frame: Buffer) => void) {}

  push(chunk: Uint8Array): void {
    for (const byte of chunk) this.take(byte)
  }

  reset(): void {
    this.frame = undefined
    this.escaped = false
  }

  private take(byte: number): void {
    const frame = this.frame
    if (frame === undefined) {
      if (byte === END) this.frame = []
      return
    }
    if (byte === END) {
      this.finish(frame)
      return
    }
    if (this.escaped) {
      this.escaped = false
      if (byte === ESC_END) frame.push(END)
      else if (byte === ESC_ESC) frame.push(ESC)
      else this.reset()
    } else if (byte === ESC) {
      this.escaped = true
    } else {
      frame.push(byte)
    }
    if (frame.length > FRAME_LIMIT) this.reset()
  }

  private finish(frame: number[]): void {
    if (frame.length === 0) return
    if (frame[0] !== RESPONSE_DIRECTION) {
      this.frame = []
      this.escaped = false
      return
    }
    this.reset()
    this.onFrame(Buffer.from(frame))
  }
}
