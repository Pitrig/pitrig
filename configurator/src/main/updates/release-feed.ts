import { app, net } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { t } from '@shared/ui-text'

const REPOSITORY = 'Pitrig/pitrig'
const API = `https://api.github.com/repos/${REPOSITORY}/releases`
const DOWNLOADS = `https://github.com/${REPOSITORY}/releases/download/`
export const LATEST_RELEASE_PAGE = `https://github.com/${REPOSITORY}/releases/latest`

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  sha256?: string
}

export interface Release {
  version: string
  assets: ReleaseAsset[]
}

interface ApiAsset {
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
  digest?: unknown
}

interface ApiRelease {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

export async function latestRelease(): Promise<Release | undefined> {
  return fetchRelease(`${API}/latest`)
}

export async function releaseTagged(version: string): Promise<Release | undefined> {
  return fetchRelease(`${API}/tags/v${encodeURIComponent(version)}`)
}

export async function downloadAsset(
  asset: ReleaseAsset,
  path: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const response = await net.fetch(asset.url, { headers: { 'User-Agent': userAgent() } })
  if (!response.ok || !response.body) {
    throw new Error(t('updates.releaseFeed.downloadFailed', { name: asset.name, status: response.status }))
  }
  const chunks: Uint8Array[] = []
  let received = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onProgress(Math.min(1, received / asset.size))
  }
  const bytes = Buffer.concat(chunks)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== asset.size || (asset.sha256 !== undefined && digest !== asset.sha256)) {
    throw new Error(t('updates.releaseFeed.downloadDamaged', { name: asset.name }))
  }
  await mkdir(dirname(path), { recursive: true })
  const partial = `${path}.part`
  try {
    await writeFile(partial, bytes)
    await rename(partial, path)
  } finally {
    await rm(partial, { force: true })
  }
}

async function fetchRelease(url: string): Promise<Release | undefined> {
  const response = await net.fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': userAgent(),
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(t('updates.releaseFeed.githubAnswered', { status: response.status }))
  }
  return parseRelease(await response.json())
}

function parseRelease(value: unknown): Release | undefined {
  const release = value as ApiRelease | null
  if (typeof release?.tag_name !== 'string' || release.draft === true || release.prerelease === true) {
    return undefined
  }
  return {
    version: release.tag_name.replace(/^v/, ''),
    assets: Array.isArray(release.assets) ? release.assets.flatMap(parseAsset) : []
  }
}

function parseAsset(value: unknown): ReleaseAsset[] {
  const asset = value as ApiAsset | null
  if (
    typeof asset?.name !== 'string' ||
    typeof asset.browser_download_url !== 'string' ||
    !asset.browser_download_url.startsWith(DOWNLOADS) ||
    typeof asset.size !== 'number'
  ) {
    return []
  }
  const digest =
    typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')
      ? asset.digest.slice('sha256:'.length)
      : undefined
  return [
    {
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      ...(digest ? { sha256: digest } : {})
    }
  ]
}

function userAgent(): string {
  return `Pitrig/${app.getVersion()}`
}
