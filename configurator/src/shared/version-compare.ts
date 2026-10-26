const VERSION = /^v?(\d+)\.(\d+)\.(\d+)/

type Parts = [number, number, number]

function parts(text: string | undefined): Parts | undefined {
  const match = VERSION.exec(text?.trim() ?? '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

export function compareVersions(left: string | undefined, right: string | undefined): number | undefined {
  const a = parts(left)
  const b = parts(right)
  if (!a || !b) return undefined
  for (const index of [0, 1, 2] as const) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return 0
}

export function isOlder(left: string | undefined, right: string | undefined): boolean {
  return compareVersions(left, right) === -1
}

export function shortVersion(text: string | undefined): string | undefined {
  return parts(text)?.join('.')
}
