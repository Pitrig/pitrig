import { crc32 as zlibCrc32 } from 'node:zlib'

export function crc32(bytes: Uint8Array): number {
  return zlibCrc32(bytes)
}
