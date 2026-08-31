import { useState, type MouseEvent } from 'react'

const WINDOW = 120

export interface ChartSeries {
  label: string
  color: string
  points: number[]
}

interface BenchChartProps {
  title: string
  series: ChartSeries[]
  times?: number[]
  unit?: string
  minimum?: number
  maximum?: number
  reference?: number
  format?: (value: number) => string
}

interface HoverState {
  index: number
  x: number
}

export function BenchChart({
  title,
  series,
  times,
  unit,
  minimum,
  maximum,
  reference,
  format = (value) => value.toFixed(0)
}: BenchChartProps): React.JSX.Element {
  const [hover, setHover] = useState<HoverState>()
  const windows = series.map((entry) => entry.points.slice(-WINDOW))
  const values = windows.flat()
  const low = Math.min(minimum ?? 0, ...(values.length > 0 ? values : [0]))
  const high = Math.max(
    maximum ?? Number.NEGATIVE_INFINITY,
    reference ?? Number.NEGATIVE_INFINITY,
    ...(values.length > 0 ? values : [1])
  )
  const span = high - low > 0 ? high - low : 1
  const longest = Math.max(0, ...windows.map((points) => points.length))
  const stamps = times === undefined ? undefined : times.slice(-WINDOW)
  const active = hover && hover.index < longest ? hover : undefined

  const onMove = (event: MouseEvent<HTMLDivElement>): void => {
    if (longest === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const step = 100 / (WINDOW - 1)
    const offset = 100 - (longest - 1) * step
    const svgX = ((event.clientX - rect.left) / rect.width) * 100
    const index = Math.min(longest - 1, Math.max(0, Math.round((svgX - offset) / step)))
    setHover({ index, x: ((offset + index * step) / 100) * rect.width })
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
      <header className="flex flex-none items-baseline justify-between gap-2 px-2.5 pt-1.5">
        <h3 className="truncate text-[11px] font-medium text-muted-foreground">{title}</h3>
        <div className="flex flex-none items-baseline gap-2 font-mono text-[11px]">
          {series.map((entry, index) => {
            const latest = windows[index]?.at(-1)
            return (
              <span key={entry.label} style={{ color: entry.color }}>
                {series.length > 1 ? <span className="mr-1 opacity-70">{entry.label}</span> : null}
                {latest === undefined ? '—' : format(latest)}
                {unit && latest !== undefined ? unit : ''}
              </span>
            )
          })}
        </div>
      </header>
      <div
        className="relative min-h-0 flex-1"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(undefined)}
      >
        <svg
          className="size-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
          role="presentation"
        >
          {reference === undefined ? null : (
            <line
              x1="0"
              x2="100"
              y1={project(reference, low, span)}
              y2={project(reference, low, span)}
              stroke="currentColor"
              strokeDasharray="2 3"
              strokeWidth="1"
              className="text-muted-foreground/40"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {windows.map((points, index) => (
            <polyline
              key={series[index]?.label ?? index}
              fill="none"
              stroke={series[index]?.color}
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              points={pathOf(points, longest, low, span)}
            />
          ))}
          {active === undefined ? null : (
            <>
              <line
                x1={crosshair(active.index, longest)}
                x2={crosshair(active.index, longest)}
                y1="0"
                y2="100"
                stroke="currentColor"
                strokeWidth="1"
                className="text-muted-foreground/50"
                vectorEffect="non-scaling-stroke"
              />
              {windows.map((points, index) => {
                const value = valueAt(points, longest, active.index)
                if (value === undefined) return null
                return (
                  <circle
                    key={series[index]?.label ?? index}
                    cx={crosshair(active.index, longest)}
                    cy={project(value, low, span)}
                    r="2.5"
                    fill={series[index]?.color}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </>
          )}
        </svg>
        {active === undefined ? null : (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-24 -translate-x-1/2 rounded-md border bg-popover/95 px-2 py-1 text-[10px] shadow-lg backdrop-blur-sm"
            style={{ left: `clamp(3.5rem, ${active.x}px, calc(100% - 3.5rem))` }}
          >
            {stamps?.[active.index] === undefined ? null : (
              <div className="mb-0.5 font-mono text-muted-foreground">
                {clock(stamps[active.index] as number)}
              </div>
            )}
            {series.map((entry, index) => {
              const value = valueAt(windows[index] ?? [], longest, active.index)
              return (
                <div key={entry.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-1.5 flex-none rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.label}
                  </span>
                  <span className="font-mono text-foreground">
                    {value === undefined ? '—' : `${format(value)}${unit ?? ''}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <footer className="flex flex-none justify-between px-2.5 pb-1 font-mono text-[9px] text-muted-foreground/70">
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </footer>
    </section>
  )
}

function project(value: number, low: number, span: number): number {
  return 100 - ((value - low) / span) * 100
}

function crosshair(index: number, longest: number): number {
  const step = 100 / (WINDOW - 1)
  return 100 - (longest - 1 - index) * step
}

function valueAt(points: number[], longest: number, index: number): number | undefined {
  return points[points.length - longest + index]
}

function pathOf(points: number[], longest: number, low: number, span: number): string {
  if (points.length === 0) return ''
  const step = 100 / (WINDOW - 1)
  const offset = 100 - (longest - 1) * step
  const lead = longest - points.length
  return points
    .map(
      (value, index) =>
        `${(offset + (lead + index) * step).toFixed(2)},${project(value, low, span).toFixed(2)}`
    )
    .join(' ')
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
