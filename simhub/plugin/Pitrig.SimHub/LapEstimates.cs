using System;

namespace Pitrig.SimHub
{
    internal static class LapEstimates
    {
        private const string SessionBestBased = "PersistantTrackerPlugin.EstimatedLapTime_SessionBestBasedSimhub";
        private const string AllTimeBestBased = "PersistantTrackerPlugin.EstimatedLapTime_AllTimeBestBased";

        public static double? Seconds(TelemetryState state)
        {
            if (state.Status == null) return null;
            return Session(state) ?? AllTime(state) ?? Computed.Seconds(state.Status.CurrentLapTime);
        }

        public static double? DeltaSeconds(TelemetryState state)
        {
            if (state.Status == null) return null;
            var session = Session(state);
            if (session != null) return session - Best(state) ?? 0;
            return AllTime(state) - (Record(state) ?? 0) ?? 0;
        }

        public static double? SessionDeltaSeconds(TelemetryState state)
        {
            if (state.Status == null) return null;
            var best = Best(state);
            if (best == null) return null;
            var session = Session(state);
            return session != null ? session - best : Game(state);
        }

        public static double? OwnDifference(TelemetryState state)
        {
            var session = Session(state);
            if (session != null) return session - Best(state);
            return AllTime(state) - (Record(state) ?? 0);
        }

        public static double? OverallDifference(TelemetryState state, double overallBest)
        {
            return (Session(state) ?? AllTime(state)) - overallBest;
        }

        private static double? Session(TelemetryState state)
        {
            return Tracker(state, SessionBestBased);
        }

        private static double? AllTime(TelemetryState state)
        {
            return Tracker(state, AllTimeBestBased);
        }

        private static double? Best(TelemetryState state)
        {
            return Computed.Seconds(state.Status.BestLapTime);
        }

        private static double? Record(TelemetryState state)
        {
            return Computed.Seconds(state.Status.AllTimeBest);
        }

        private static double? Game(TelemetryState state)
        {
            return Best(state) == null ? null : state.Status.DeltaToSessionBest;
        }

        private static double? Tracker(TelemetryState state, string property)
        {
            return Computed.Seconds(state.Manager.GetPropertyValue(property) as TimeSpan?);
        }
    }
}
