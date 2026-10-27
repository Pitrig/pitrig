import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  SIMHUB_MINIMUM_VERSION,
  type InstallPluginResult,
  type SimHubStatus
} from '../../shared/app-updates'
import { compareVersions, isOlder, shortVersion } from '../../shared/version-compare'
import { t } from '@shared/ui-text'

const PLUGIN_FILE = 'Pitrig.SimHub.dll'
const SIMHUB_EXECUTABLE = 'SimHubWPF.exe'
const POWERSHELL_TIMEOUT_MS = 20_000
const SIMHUB_EXIT_WAIT_MS = 10_000

interface Probe {
  directory?: string
  version?: string
  plugin?: string
  bundled?: string
  running: boolean
}

const PROBE_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$roots = 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
  "$entries = @(Get-ItemProperty $roots | Where-Object { $_.DisplayName -like 'SimHub*' -and $_.InstallLocation })",
  "$candidates = @((Join-Path ${env:ProgramFiles(x86)} 'SimHub')) + @($entries | ForEach-Object { $_.InstallLocation.TrimEnd('\\') })",
  '$directory = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ SIMHUB)) } | Select-Object -First 1',
  "$entry = $entries | Where-Object { $_.InstallLocation.TrimEnd('\\') -eq $directory } | Select-Object -First 1",
  '$plugin = if ($directory) { (Get-Item -LiteralPath (Join-Path $directory PLUGIN)).VersionInfo.FileVersion }',
  '$bundled = if (Test-Path -LiteralPath BUNDLED) { (Get-Item -LiteralPath BUNDLED).VersionInfo.FileVersion }',
  '@{ directory = $directory; version = $entry.DisplayVersion; plugin = $plugin; bundled = $bundled; running = [bool](Get-Process -Name SimHubWPF) } | ConvertTo-Json -Compress'
].join('\n')

export function simHubSupported(): boolean {
  return process.platform === 'win32'
}

export async function probeSimHub(): Promise<Probe> {
  const script = PROBE_SCRIPT.replaceAll('SIMHUB', quoted(SIMHUB_EXECUTABLE))
    .replaceAll('PLUGIN', quoted(PLUGIN_FILE))
    .replaceAll('BUNDLED', quoted(bundledPlugin()))
  const parsed = JSON.parse(await powershell(script)) as Partial<Record<keyof Probe, unknown>>
  return {
    ...(typeof parsed.directory === 'string' ? { directory: parsed.directory } : {}),
    ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
    ...(typeof parsed.plugin === 'string' ? { plugin: parsed.plugin } : {}),
    ...(typeof parsed.bundled === 'string' ? { bundled: parsed.bundled } : {}),
    running: parsed.running === true
  }
}

export function describeSimHub(probe: Probe): SimHubStatus | undefined {
  if (!probe.directory) return undefined
  const plugin = shortVersion(probe.plugin)
  const bundledPlugin = shortVersion(probe.bundled)
  return {
    ...(probe.version ? { version: probe.version } : {}),
    tooOld: isOlder(probe.version, SIMHUB_MINIMUM_VERSION),
    running: probe.running,
    ...(plugin ? { plugin } : {}),
    ...(bundledPlugin ? { bundledPlugin } : {}),
    pluginState: !bundledPlugin
      ? 'unknown'
      : !plugin
        ? 'missing'
        : compareVersions(plugin, bundledPlugin) === -1
          ? 'stale'
          : 'current'
  }
}

export async function installPlugin(closeSimHub: boolean): Promise<InstallPluginResult> {
  const probe = await probeSimHub()
  if (!probe.directory) return { outcome: 'failed', message: t('updates.simhub.noSimHubFound') }
  if (!probe.bundled) return { outcome: 'failed', message: t('updates.simhub.noBundledPlugin') }
  if (probe.running && !closeSimHub) return { outcome: 'simhub_running' }
  if (probe.running && !(await stopSimHub())) {
    return { outcome: 'failed', message: t('updates.simhub.stillRunning') }
  }
  const target = join(probe.directory, PLUGIN_FILE)
  try {
    await copyFile(bundledPlugin(), target)
  } catch {
    await powershell(
      `Start-Process -FilePath 'cmd.exe' -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '/s', '/c', ${quoted(`copy /y "${bundledPlugin()}" "${target}"`)}`
    ).catch(() => '')
  }
  const after = await probeSimHub()
  if (probe.running) startSimHub(probe.directory)
  if (shortVersion(after.plugin) !== shortVersion(after.bundled)) {
    return { outcome: 'failed', message: t('updates.simhub.copyFailed', { directory: probe.directory }) }
  }
  return { outcome: 'installed' }
}

function bundledPlugin(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'simhub-plugin', PLUGIN_FILE)
}

async function stopSimHub(): Promise<boolean> {
  await run('taskkill.exe', ['/IM', SIMHUB_EXECUTABLE]).catch(() => '')
  const deadline = Date.now() + SIMHUB_EXIT_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (!(await probeSimHub()).running) return true
  }
  await run('taskkill.exe', ['/F', '/IM', SIMHUB_EXECUTABLE]).catch(() => '')
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  return !(await probeSimHub()).running
}

function startSimHub(directory: string): void {
  spawn(join(directory, SIMHUB_EXECUTABLE), [], {
    cwd: directory,
    detached: true,
    stdio: 'ignore'
  }).unref()
}

function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`
}

function powershell(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
    )
  })
}
