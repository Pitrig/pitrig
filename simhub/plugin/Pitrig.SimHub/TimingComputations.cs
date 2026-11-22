using System;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class TimingComputations
    {
        internal const int StatusNone = 0;
        internal const int StatusSlower = 1;
        internal const int StatusPersonalBest = 2;
        internal const int StatusSessionBest = 3;
        private const int StatusInvalid = 4;
        private const string AllTimeBestLiveDelta = "PersistantTrackerPlugin.AllTimeBestLiveDeltaSeconds";
        private const string IracingGame = "IRacing";
        private const string IracingLapsRemaining = "DataCorePlugin.GameRawData.Telemetry.SessionLapsRemain";

        public static double? LiveDelta(TelemetryState state)
        {
            return LapEstimates.DeltaSeconds(state) * 1000;
        }

        public static double? AllTimeLiveDelta(TelemetryState state)
        {
            if (Computed.Seconds(state.Status?.AllTimeBest) == null) return null;
            return Computed.Number(state.Manager.GetPropertyValue(AllTimeBestLiveDelta)) * 1000;
        }

        public static double? LiveDeltaSeconds(TelemetryState state)
        {
            return LapEstimates.DeltaSeconds(state);
        }

        public static double? EstimatedLapTime(TelemetryState state)
        {
            return LapEstimates.Seconds(state) * 1000;
        }

        public static TimeSpan? SessionBestLap(StatusDataBase status)
        {
            var best = status?.BestLapSameClassOpponent?.BestLapTime;
            return best > TimeSpan.Zero ? best : null;
        }

        public static double? SessionBestDelta(TelemetryState state)
        {
            return (LapEstimates.Seconds(state) - Computed.Seconds(SessionBestLap(state.Status))) * 1000;
        }

        public static double? LastLapDeltaBest(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var last = Computed.Seconds(status.LastLapTime);
            var best = BestSeconds(status);
            if (last == null || best == null) return null;
            if (Thousandths(last) != Thousandths(best)) return (last - best) * 1000;
            return (last - state.PreviousBestSeconds) * 1000;
        }

        public static int? DeltaStatus(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            return Grade(LapEstimates.Seconds(state), BestSeconds(status), OverallBestSeconds(status),
                state.Validity.Invalid(state));
        }

        public static int? LastLapStatus(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            return Grade(Computed.Seconds(status.LastLapTime), BestSeconds(status), OverallBestSeconds(status),
                state.Validity.LastLapInvalid);
        }

        public static int? Grade(double? seconds, double? ownBest, double? overallBest, bool? invalid)
        {
            if (invalid == true) return StatusInvalid;
            var time = Thousandths(seconds);
            if (time == null) return null;
            if (time <= Thousandths(overallBest)) return StatusSessionBest;
            var own = Thousandths(ownBest);
            if (own == null) return null;
            return time <= own ? StatusPersonalBest : StatusSlower;
        }

        public static double? LapsRemaining(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (status.TotalLaps > 0) return RaceLapsRemaining(state);
            var lap = LapSeconds(state);
            if (lap == null) return null;
            var left = status.SessionTimeLeft.TotalSeconds;
            if (left <= 0) return 1;
            var driven = state.LapTimerStale ? 0 : status.CurrentLapTime.TotalSeconds;
            var toLine = Math.Max(lap.Value - driven, 0);
            return 1 + Math.Ceiling(Math.Max(left - toLine, 0) / lap.Value);
        }

        public static double? DistanceRemaining(StatusDataBase status)
        {
            var length = status?.TrackLength ?? 0;
            var position = status?.TrackPositionPercent ?? double.NaN;
            if (!(length > 0) || double.IsNaN(position)) return null;
            return length * (1 - Math.Min(Math.Max(position, 0), 1));
        }

        public static double? RaceLapsRemaining(TelemetryState state)
        {
            if (state.GameName == IracingGame) return Computed.Number(state.Manager.GetPropertyValue(IracingLapsRemaining));
            return state.Status?.RemainingLaps;
        }

        public static double? LapSeconds(TelemetryState state)
        {
            return BestSeconds(state.Status) ?? state.CleanLapSeconds ?? Computed.Seconds(state.Status?.AllTimeBest);
        }

        private static double? BestSeconds(StatusDataBase status)
        {
            return Computed.Seconds(status?.BestLapTime);
        }

        private static double? OverallBestSeconds(StatusDataBase status)
        {
            return Computed.Seconds(SessionBestLap(status));
        }

        private static double? Thousandths(double? seconds)
        {
            return seconds == null ? (double?)null : Math.Round(seconds.Value * 1000);
        }
    }
}
