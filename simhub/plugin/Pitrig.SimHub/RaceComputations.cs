using System;
using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class RaceComputations
    {
        private const int LeaderPosition = 1;
        private const string RaceSession = "race";
        public static int? ClassPosition(TelemetryState state)
        {
            var opponents = state.Status?.Opponents;
            if (opponents == null) return null;
            var row = state.Status.PlayerLeaderboardPosition - 1;
            return row >= 0 && row < opponents.Count ? opponents[row].PositionInClass : (int?)null;
        }

        public static double? NeighbourGap(TelemetryState state, int offset)
        {
            var position = state.Player?.Position;
            return position == null ? null : Gap(state, position + offset);
        }

        public static double? LeaderGap(TelemetryState state)
        {
            var position = state.Player?.Position;
            if (position == null) return null;
            return position == LeaderPosition ? 0 : Gap(state, LeaderPosition);
        }

        public static int? StartingPosition(TelemetryState state)
        {
            var position = state.Player?.StartPosition;
            return position > 0 ? position : null;
        }

        private static double? Gap(TelemetryState state, int? position)
        {
            var opponent = state.Status.Opponents.FirstOrDefault(candidate => candidate.Position == position);
            if (opponent == null) return null;
            var gap = Racing(state.Status)
                ? opponent.GaptoPlayer
                : Computed.Seconds(state.Player.BestLapTime) - Computed.Seconds(opponent.BestLapTime);
            return gap == null ? (double?)null : Math.Abs(gap.Value);
        }

        private static bool Racing(StatusDataBase status)
        {
            return status.SessionTypeName?.IndexOf(RaceSession, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
