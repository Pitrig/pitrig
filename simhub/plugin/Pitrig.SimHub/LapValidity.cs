using System;

namespace Pitrig.SimHub
{
    internal sealed class LapValidity
    {
        private const string Iracing = "IRacing";
        private const string Acc = "AssettoCorsaCompetizione";
        private const string F1Prefix = "F1";
        private const string IracingRace = "Race";
        private const int IracingOffTrack = 0;
        private const string IracingTrackSurface = "DataCorePlugin.GameRawData.Telemetry.PlayerTrackSurface";
        private const string AccValidLap = "DataCorePlugin.GameRawData.Graphics.isValidLap";
        private const string F1LapInvalid = "DataCorePlugin.GameRawData.PlayerLapData.m_currentLapInvalid";

        private int? lap;
        private bool leftTrack;
        private bool? current;

        public bool? LastLapInvalid { get; private set; }

        public void Reset()
        {
            lap = null;
            leftTrack = false;
            current = null;
            LastLapInvalid = null;
        }

        public void Update(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return;
            if (status.CompletedLaps != lap)
            {
                LastLapInvalid = lap == null ? null : current;
                lap = status.CompletedLaps;
                leftTrack = false;
            }
            current = state.GameName == Iracing ? IracingVerdict(state) : GameVerdict(state);
        }

        public bool? Invalid(TelemetryState state)
        {
            return state.Status == null ? null : current;
        }

        public bool? Valid(TelemetryState state)
        {
            var invalid = Invalid(state);
            return invalid == null ? null : (bool?)!invalid.Value;
        }

        private bool? IracingVerdict(TelemetryState state)
        {
            if (string.Equals(state.Status.SessionTypeName, IracingRace, StringComparison.OrdinalIgnoreCase)) return false;
            var surface = Raw(state, IracingTrackSurface);
            leftTrack |= surface == IracingOffTrack;
            if (leftTrack) return true;
            return surface == null ? (bool?)null : false;
        }

        private static bool? GameVerdict(TelemetryState state)
        {
            var game = state.GameName ?? string.Empty;
            if (game == Acc && Raw(state, AccValidLap) is double valid) return valid != 1;
            if (game.StartsWith(F1Prefix, StringComparison.Ordinal) && Raw(state, F1LapInvalid) is double invalid)
            {
                return invalid != 0;
            }
            return state.Status.LapInvalidated ? true : (bool?)null;
        }

        private static double? Raw(TelemetryState state, string property)
        {
            return Computed.Number(state.Manager.GetPropertyValue(property));
        }
    }
}
