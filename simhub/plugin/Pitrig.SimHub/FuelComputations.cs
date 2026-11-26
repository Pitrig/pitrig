using System;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class FuelComputations
    {
        private const string PerLap = "DataCorePlugin.Computed.Fuel_LitersPerLap";

        public static double? Required(TelemetryState state)
        {
            return LapsLeft(state) * PerLapFuel(state);
        }

        public static double? ToAdd(TelemetryState state)
        {
            var required = Required(state);
            if (required == null) return null;
            var fuel = state.Status.Fuel;
            var refuel = Math.Max(required.Value + state.FuelMargin - fuel, 0);
            var capacity = Capacity(state);
            return capacity > 0 ? Math.Min(refuel, Math.Max(capacity - fuel, 0)) : refuel;
        }

        public static double? AtFinish(TelemetryState state)
        {
            var required = Required(state);
            return required == null ? null : (double?)Math.Max(state.Status.Fuel - required.Value, 0);
        }

        public static bool? PitNow(TelemetryState state)
        {
            var status = state.Status;
            var perLap = PerLapFuel(state);
            if (status == null || perLap == null) return null;
            if (status.IsInPitLane > 0 || status.IsInPit > 0) return false;
            var usable = status.Fuel - state.FuelMargin;
            if (usable >= Required(state)) return false;
            var lapToGo = 1 - Math.Max(0, Math.Min(1, status.TrackPositionPercent));
            return usable / perLap.Value - lapToGo < 1;
        }

        private static double? LapsLeft(TelemetryState state)
        {
            switch (SessionComputations.TimedSession(state))
            {
                case true:
                    return TimingComputations.LapsToFlag(state) - LapDriven(state);
                case false:
                    return TimingComputations.RaceLapsRemaining(state);
                default:
                    return state.Status != null && state.TimedSessionSeen ? 1 - LapDriven(state) : (double?)null;
            }
        }

        private static double LapDriven(TelemetryState state)
        {
            if (state.LapTimerStale) return 0;
            var position = Math.Max(0, Math.Min(1, state.Status.TrackPositionPercent));
            var lap = TimingComputations.LapSeconds(state);
            if (lap == null || !(lap > 0)) return position;
            return Math.Min(position, Math.Max(0, Math.Min(1, state.Status.CurrentLapTime.TotalSeconds / lap.Value)));
        }

        private static double? PerLapFuel(TelemetryState state)
        {
            var perLap = Computed.Number(state.Manager.GetPropertyValue(PerLap));
            return perLap > 0 ? perLap : null;
        }

        private static double Capacity(TelemetryState state)
        {
            StatusDataBase status = state.Status;
            return state.GameName == "IRacing" ? status.CarSettings_MaxFUEL : status.MaxFuel;
        }
    }
}
