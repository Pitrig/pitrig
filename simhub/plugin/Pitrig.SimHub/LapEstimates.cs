using System;

namespace Pitrig.SimHub
{
    internal static class LapEstimates
    {
        private const string SessionBestBased = "PersistantTrackerPlugin.EstimatedLapTime_SessionBestBasedSimhub";

        public static double? Seconds(TelemetryState state)
        {
            if (state.Status == null) return null;
            return Computed.Seconds(state.Manager.GetPropertyValue(SessionBestBased) as TimeSpan?);
        }

        public static double? DeltaSeconds(TelemetryState state)
        {
            return Seconds(state) - Computed.Seconds(state.Status?.BestLapTime);
        }
    }
}
