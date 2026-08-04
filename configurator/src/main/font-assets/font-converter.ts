import { utilityProcess } from 'electron'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const CONVERTER_WORKER_ENTRY = fileURLToPath(
  new URL('./font-converter-worker.js', import.meta.url)
)
export async function convertFont(
  sourcePath: string,
  sizePx: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), 'simcore-font-'))
  const outputPath = join(directory, 'font.bin')
  try {
    await runConverter(sourcePath, outputPath, sizePx, signal)
    return new Uint8Array(await readFile(outputPath))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function runConverter(
  sourcePath: string,
  outputPath: string,
  sizePx: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Font conversion was cancelled.'))
      return
    }

    const child = utilityProcess.fork(
      CONVERTER_WORKER_ENTRY,
      [
        '--font', sourcePath,
        '--range', '0x20-0x7e',
        '--size', String(sizePx),
        '--format', 'bin',
        '--bpp', '4',
        '--no-compress',
        '--output', outputPath
      ],
      { stdio: 'pipe', serviceName: 'SimCore Font Converter' }
    )
    let diagnostics = ''
    let settled = false

    const appendDiagnostics = (chunk: Uint8Array): void => {
      diagnostics += Buffer.from(chunk).toString('utf8')
    }
    child.stdout?.on('data', appendDiagnostics)
    child.stderr?.on('data', appendDiagnostics)

    const cleanup = (): void => signal.removeEventListener('abort', cancel)
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const cancel = (): void => {
      if (!child.kill()) {
        finish(new Error('Font conversion was cancelled.'))
      }
    }

    signal.addEventListener('abort', cancel, { once: true })
    child.once('error', (type) => finish(new Error(`Font converter failed: ${type}`)))
    child.once('exit', (code) => {
      if (signal.aborted) {
        finish(new Error('Font conversion was cancelled.'))
      } else if (code === 0) {
        finish()
      } else {
        finish(new Error(diagnostics.trim() || `Font converter exited with code ${code}.`))
      }
    })
  })
}
