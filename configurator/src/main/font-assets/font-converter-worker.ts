import { createRequire } from 'node:module'

interface ConverterCli {
  run: (arguments_: string[]) => Promise<void>
}

const require = createRequire(import.meta.url)
const converter = require('lv_font_conv/lib/cli.js') as ConverterCli

void converter.run(process.argv.slice(2)).then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${formatError(error)}\n`, () => process.exit(1))
  }
)

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}
