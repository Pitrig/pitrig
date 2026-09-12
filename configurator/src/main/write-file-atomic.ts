import { rename, rm, writeFile } from 'node:fs/promises'

export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, data)
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}
