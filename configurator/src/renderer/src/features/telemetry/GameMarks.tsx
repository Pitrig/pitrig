import {
  TELEMETRY_GAMES,
  type TelemetryCatalogEntry,
  type TelemetryGame
} from '@shared/telemetry-catalog'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'

const GAMES = Object.keys(TELEMETRY_GAMES) as TelemetryGame[]

export function GameMarks({ entry }: { entry: TelemetryCatalogEntry }): React.JSX.Element | null {
  const games = entry.games
  if (!games) return null
  const title =
    games.length === 0
      ? t('telemetry.gameMarks.noneOfTheGames')
      : t('telemetry.gameMarks.sentBy', { games: games.map((game) => TELEMETRY_GAMES[game]).join(', ') })
  return (
    <span className="inline-flex flex-wrap gap-0.5 align-middle" title={title}>
      {GAMES.map((game) => (
        <span
          key={game}
          className={cn(
            'rounded px-1 text-[9px] leading-4',
            games.includes(game) ? 'bg-sky-500/15 text-sky-300' : 'text-muted-foreground/50 line-through'
          )}
        >
          {TELEMETRY_GAMES[game]}
        </span>
      ))}
    </span>
  )
}
