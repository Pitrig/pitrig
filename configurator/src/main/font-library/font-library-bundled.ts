import { stat } from 'node:fs/promises'

import { BUNDLED_FACES } from './bundled-faces'
import { hasTabularDigits } from './font-metrics'

export type ReadFace = (id: string) => Promise<Uint8Array | undefined>

export class BundledFaceFacts {
  private sizes: Map<string, number> | undefined
  private readonly tabular = new Map<string, boolean | null>()

  constructor(private readonly readFace: ReadFace) {}

  async fileSizes(): Promise<Map<string, number>> {
    if (this.sizes) return this.sizes
    const sizes = new Map<string, number>()
    for (const face of BUNDLED_FACES) {
      try {
        sizes.set(face.id, (await stat(face.path)).size)
      } catch {
      }
    }
    this.sizes = sizes
    return sizes
  }

  async tabularDigitsOf(id: string): Promise<boolean | undefined> {
    const known = this.tabular.get(id)
    if (known !== undefined) return known ?? undefined
    const bytes = await this.readFace(id)
    const tabular = bytes ? hasTabularDigits(bytes) : undefined
    this.tabular.set(id, tabular ?? null)
    return tabular
  }
}
