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
        private static readonly TimeSpan TimerRestart = TimeSpan.FromSeconds(1);
        private static readonly TimeSpan BoundaryWindow = TimeSpan.FromSeconds(5);

        private int? lap;
        private bool leftTrack;
        private bool? current;
        private bool? running;
        private bool? ended;
        private bool timerRestartedFirst;
        private bool countMovedFirst;
        private TimeSpan timer;

        public bool? LastLapInvalid { get; private set; }

        public void Reset()
        {
            lap = null;
            leftTrack = false;
            current = null;
            running = null;
            ended = null;
            timerRestartedFirst = false;
            countMovedFirst = false;
            timer = TimeSpan.Zero;
            LastLapInvalid = null;
        }

        public void Update(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return;
            TrackTimer(status.CurrentLapTime);
            if (status.CompletedLaps != lap) CountLap(status.CompletedLaps);
            current = state.GameName == Iracing ? IracingVerdict(state) : GameVerdict(state);
            running = Worse(running, current);
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

        private void TrackTimer(TimeSpan now)
        {
            var restarted = now + TimerRestart < timer;
            timer = now;
            if (restarted && lap != null)
            {
                if (countMovedFirst) countMovedFirst = false;
                else EndLapByTimer();
            }
            else if (now > BoundaryWindow)
            {
                countMovedFirst = false;
                timerRestartedFirst = false;
                ended = null;
            }
        }

        private void EndLapByTimer()
        {
            ended = running;
            running = null;
            leftTrack = false;
            timerRestartedFirst = true;
        }

        private void CountLap(int completed)
        {
            if (lap != null) LastLapInvalid = timerRestartedFirst ? ended : running;
            if (!timerRestartedFirst)
            {
                running = null;
                countMovedFirst = lap != null;
            }
            timerRestartedFirst = false;
            ended = null;
            lap = completed;
            leftTrack = false;
        }

        private static bool? Worse(bool? lapSoFar, bool? now)
        {
            if (lapSoFar == true || now == true) return true;
            return lapSoFar == false || now == false ? false : (bool?)null;
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
