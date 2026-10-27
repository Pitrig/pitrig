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
            return Computed.Number(state.Manager.GetPropertyValue(AllTimeBestLiveDelta)) * 1000;
        }

        public static double? LiveDeltaSeconds(TelemetryState state)
        {
            return LapEstimates.SessionDeltaSeconds(state);
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
            return (EstimatedSeconds(state) - Computed.Seconds(SessionBestLap(state.Status))) * 1000;
        }

        public static double? LastLapDeltaBest(StatusDataBase status)
        {
            if (status == null) return null;
            return (Computed.Seconds(status.LastLapTime) - BestSeconds(status)) * 1000;
        }

        public static int? DeltaStatus(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (LapValidity.ShowsNoTiming(state.GameName)) return StatusNone;
            if (state.Validity.Invalid(state) == true) return StatusInvalid;
            return Grade(LapEstimates.OwnDifference(state),
                LapEstimates.OverallDifference(state, OverallBestSeconds(status)));
        }

        public static int? LastLapStatus(StatusDataBase status)
        {
            if (status == null) return null;
            var last = Computed.Seconds(status.LastLapTime);
            if (last == null) return StatusNone;
            return Grade(last - (BestSeconds(status) ?? 0), last - OverallBestSeconds(status));
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
            var toLine = Math.Max(lap.Value - status.CurrentLapTime.TotalSeconds, 0);
            return 1 + Math.Ceiling(Math.Max(left - toLine, 0) / lap.Value);
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

        private static double? EstimatedSeconds(TelemetryState state)
        {
            return BestSeconds(state.Status) + LiveDeltaSeconds(state);
        }

        private static int Grade(double? own, double? overall)
        {
            if (own == null && overall == null) return StatusNone;
            if (own > 0) return StatusSlower;
            return overall > 0 ? StatusPersonalBest : StatusSessionBest;
        }

        private static double OverallBestSeconds(StatusDataBase status)
        {
            var opponents = status.Opponents;
            var index = status.BestLapOpponentPosition;
            if (opponents == null || index < 0 || index >= opponents.Count) return 0;
            return opponents[index].BestLapTime.TotalSeconds;
        }
    }
}
