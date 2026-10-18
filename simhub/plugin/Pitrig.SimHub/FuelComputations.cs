using System;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class FuelComputations
    {
        private const string PerLap = "DataCorePlugin.Computed.Fuel_LitersPerLap";
        private const string LapsOfFuel = "DataCorePlugin.Computed.Fuel_RemainingLaps";

        public static double? TimeRemaining(TelemetryState state)
        {
            return FuelLaps(state) * TimingComputations.LapSeconds(state.Status) * 1000;
        }

        public static double? Required(TelemetryState state)
        {
            var perLap = PerLapFuel(state);
            var laps = TimingComputations.LapsRemaining(state.Status);
            if (perLap == null || laps == null) return null;
            return Math.Max(laps.Value - state.Status.TrackPositionPercent, 0) * perLap.Value;
        }

        public static double? ToAdd(TelemetryState state)
        {
            var required = Required(state);
            if (required == null) return null;
            var fuel = state.Status.Fuel;
            var missing = Math.Max(required.Value + state.ReserveLaps * PerLapFuel(state).Value - fuel, 0);
            var capacity = Capacity(state.Status);
            return capacity > 0 ? Math.Min(missing, Math.Max(capacity - fuel, 0)) : missing;
        }

        public static double? AtFinish(TelemetryState state)
        {
            return state.Status?.Fuel - Required(state);
        }

        public static bool? PitNow(TelemetryState state)
        {
            var status = state.Status;
            var atFinish = AtFinish(state);
            var laps = FuelLaps(state);
            if (atFinish == null || laps == null) return null;
            var lapsAtLine = laps.Value - (1 - status.TrackPositionPercent);
            return status.CompletedLaps > 0 && status.IsInPitLane == 0 && status.IsInPit == 0 &&
                   atFinish < 0 && lapsAtLine < 1 + state.ReserveLaps;
        }

        private static double? PerLapFuel(TelemetryState state)
        {
            var perLap = Computed.Number(state.Manager.GetPropertyValue(PerLap));
            return perLap > 0 ? perLap : null;
        }

        private static double? FuelLaps(TelemetryState state)
        {
            return Computed.Number(state.Manager.GetPropertyValue(LapsOfFuel));
        }

        private static double Capacity(StatusDataBase status)
        {
            return status.CarSettings_MaxFUEL > 0 ? status.CarSettings_MaxFUEL : status.MaxFuel;
        }
    }
}
