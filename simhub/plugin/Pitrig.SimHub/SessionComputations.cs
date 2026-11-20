using System;
using System.Linq;

namespace Pitrig.SimHub
{
    internal static class SessionComputations
    {
        private const string Iracing = "IRacing";
        private const string IracingTimeLimited = "DataCorePlugin.GameRawData.CurrentSessionInfo.IsLimitedTime";

        public static string SessionType(TelemetryState state)
        {
            var words = state.Status?.SessionTypeName?.Replace('_', ' ').ToUpperInvariant()
                .Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
            if (words == null || words.Length == 0) return null;
            var first = words.Length > 1 && Initials(state.GameName).StartsWith(words[0], StringComparison.Ordinal) ? 1 : 0;
            return string.Join(" ", words, first, words.Length - first);
        }

        public static bool? TimedSession(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (state.GameName == Iracing &&
                bool.TryParse(state.Manager.GetPropertyValue(IracingTimeLimited)?.ToString(), out var limited))
            {
                return limited;
            }
            if (status.TotalLaps > 0) return false;
            return status.SessionTimeLeft > TimeSpan.Zero ? true : (bool?)null;
        }

        private static string Initials(string game)
        {
            return new string((game ?? string.Empty).Where(char.IsUpper).ToArray());
        }
    }
}
