using System;
using System.Collections.Generic;

namespace Pitrig.SimHub
{
    internal static class SessionComputations
    {
        private const string Placeholder = "--";
        private const string F1Prefix = "F1";
        private const string F1SessionType = "DataCorePlugin.GameRawData.PacketSessionData.m_sessionType";
        private const string IracingTimed = "DataCorePlugin.GameRawData.CurrentSessionInfo.IsLimitedTime";
        private const string LapsInEvent = "DataCorePlugin.GameRawData.mLapsInEvent";
        private static readonly TimeSpan OneDay = TimeSpan.FromDays(1);

        private static readonly Dictionary<string, string> SessionNames = new Dictionary<string, string>
        {
            { "AC_TIME_ATTACK", "QUALIFY" },
            { "AC_RACE", "RACE" },
            { "AC_HOT_STINT", "HOT STINT" },
            { "AC_CRUISE", "CRUISE" },
            { "0", "UNKNOWN" },
            { "1", "PRACTICE 1" },
            { "2", "PRACTICE 2" },
            { "3", "PRACTICE 3" },
            { "4", "PRACTICE" },
            { "5", "QUALIFY 1" },
            { "6", "QUALIFY 2" },
            { "7", "QUALIFY 3" },
            { "8", "QUALIFY" },
            { "9", "ONE SHOT QUALI" },
            { "10", "RACE" },
            { "11", "RACE 2" },
            { "12", "TIME TRIAL" }
        };

        public static string SessionType(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var name = state.GameName?.StartsWith(F1Prefix, StringComparison.Ordinal) == true
                ? state.Manager.GetPropertyValue(F1SessionType)?.ToString()
                : status.SessionTypeName;
            name = name ?? string.Empty;
            if (SessionNames.TryGetValue(name, out var known)) return known;
            var text = name.Trim().ToUpperInvariant();
            return text.Length == 0 ? Placeholder : text;
        }

        public static bool? TimedSession(TelemetryState state)
        {
            return state.Status == null ? (bool?)null : Timed(state);
        }

        public static bool Timed(TelemetryState state)
        {
            var status = state.Status;
            switch (state.GameName)
            {
                case "RRRE":
                    return status.SessionTimeLeft > TimeSpan.Zero;
                case "LMU":
                case "RFactor2":
                    return status.TotalLaps == 0;
                case "IRacing":
                    return bool.TryParse(state.Manager.GetPropertyValue(IracingTimed)?.ToString(), out var limited) &&
                           limited;
                case "Automobilista2":
                    return Computed.Integer(state.Manager.GetPropertyValue(LapsInEvent)) == 0;
                default:
                    return status.SessionTimeLeft >= TimeSpan.Zero && status.SessionTimeLeft < OneDay;
            }
        }
    }
}
