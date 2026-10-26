using System;
using System.Linq;

namespace Pitrig.SimHub
{
    internal static class RaceComputations
    {
        private const int LeaderPosition = 1;

        public static int? ClassPosition(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (!status.HasMultipleClassOpponents) return status.Position;
            var inClass = state.Player?.PositionInClass;
            return inClass > 0 ? inClass : null;
        }

        public static double? NeighbourGap(TelemetryState state, int offset)
        {
            var position = state.Player?.Position;
            return position == null ? null : PositionGap(state, position + offset);
        }

        public static double? LeaderGap(TelemetryState state)
        {
            var position = state.Player?.Position;
            if (position == null) return null;
            return position == LeaderPosition ? 0 : PositionGap(state, LeaderPosition);
        }

        public static int? StartingPosition(TelemetryState state)
        {
            var position = state.Player?.StartPosition;
            return position > 0 ? position : null;
        }

        private static double? PositionGap(TelemetryState state, int? position)
        {
            var gap = state.Status.Opponents
                .FirstOrDefault(opponent => opponent.Position == position)?.GaptoPlayer;
            return gap == null ? (double?)null : Math.Abs(gap.Value);
        }
    }
}
