using System.Collections.Generic;
using System.Globalization;

namespace Pitrig.SimHub
{
    internal sealed class LapValidity
    {
        private const string Iracing = "IRacing";
        private const string Acc = "AssettoCorsaCompetizione";
        private const string RaceSession = "Race";
        private const string AccValidLap = "DataCorePlugin.GameRawData.Graphics.isValidLap";
        private const string F1LapInvalid = "DataCorePlugin.GameRawData.PlayerLapData.m_currentLapInvalid";
        private const string IracingTrackSurface = "DataCorePlugin.GameRawData.Telemetry.PlayerTrackSurface";
        private const double LapStart = 0.01;

        private static readonly HashSet<string> F1Games = new HashSet<string>
        {
            "F12020", "F12021", "F12022", "F12023", "F12024", "F12025", "F12026"
        };

        private static readonly HashSet<string> UntimedGames = new HashSet<string>
        {
            "EAWRC23", "RBR", "CodemastersDirtRally2", "FM7", "FM8"
        };

        private static readonly HashSet<string> NeverInvalidGames = new HashSet<string>
        {
            "RFactor2", "LMU", "AssettoCorsa", "ProjectMotorRacing"
        };

        private int offTrack;

        public static bool ShowsNoTiming(string game)
        {
            return game != null && UntimedGames.Contains(game);
        }

        public void Update(TelemetryState state)
        {
            if (state.GameName != Iracing || state.Status == null) return;
            if (LooselyZero(state.Manager.GetPropertyValue(IracingTrackSurface))) offTrack++;
            if (state.Status.TrackPositionPercent < LapStart) offTrack = 0;
        }

        public bool? Invalid(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var game = state.GameName ?? string.Empty;
            if (game == Iracing) return offTrack > 0 && status.SessionTypeName != RaceSession;
            if (game == Acc) return Whole(state, AccValidLap) is int valid ? valid != 1 : (bool?)null;
            if (F1Games.Contains(game)) return Whole(state, F1LapInvalid) is int invalid ? invalid != 0 : (bool?)null;
            if (NeverInvalidGames.Contains(game) || UntimedGames.Contains(game)) return false;
            return status.LapInvalidated;
        }

        public bool? Valid(TelemetryState state)
        {
            var invalid = Invalid(state);
            return invalid == null ? null : (bool?)!invalid.Value;
        }

        private static int? Whole(TelemetryState state, string property)
        {
            var value = state.Manager.GetPropertyValue(property);
            return value == null ? (int?)null : Computed.Integer(value);
        }

        private static bool LooselyZero(object value)
        {
            var text = value?.ToString().Trim() ?? string.Empty;
            return text.Length == 0 ||
                   double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && number == 0;
        }
    }
}
