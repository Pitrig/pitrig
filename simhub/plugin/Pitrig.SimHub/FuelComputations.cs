using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class FuelComputations
    {
        private const string PerLap = "DataCorePlugin.Computed.Fuel_LitersPerLap";
        private const string LapsOfFuel = "DataCorePlugin.Computed.Fuel_RemainingLaps";
        private const double PitWindowStart = 0.8;
        private const double LastLapOfFuel = 1.1;

        public static double? Required(TelemetryState state)
        {
            var required = LapsLeft(state) * PerLapFuel(state);
            return required == null || double.IsNaN(required.Value) || double.IsInfinity(required.Value) ? null : required;
        }

        public static double? ToAdd(TelemetryState state)
        {
            var perLap = PerLapFuel(state);
            var laps = LapsLeft(state);
            if (perLap == null || laps == null) return null;
            var refuel = laps.Value * perLap.Value + state.FuelMargin - state.Status.Fuel;
            var capacity = Capacity(state);
            if (refuel >= capacity) return capacity;
            return refuel > 0 ? refuel : 0;
        }

        public static double? AtFinish(TelemetryState state)
        {
            var perLap = PerLapFuel(state);
            var laps = LapsLeft(state);
            if (perLap == null || laps == null) return null;
            var surplus = state.Status.Fuel - laps.Value * perLap.Value;
            return surplus > 0 ? surplus : 0;
        }

        public static bool? PitNow(TelemetryState state)
        {
            var status = state.Status;
            var laps = FuelLaps(state);
            if (status == null || laps == null) return null;
            var inPits = status.IsInPitLane == 1 || status.IsInPit == 1;
            return status.TrackPositionPercent >= PitWindowStart && laps <= LastLapOfFuel && !inPits &&
                   status.CompletedLaps > 0;
        }

        private static double? LapsLeft(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (!SessionComputations.Timed(state)) return TimingComputations.RaceLapsRemaining(state);
            var lap = Computed.Seconds(status.BestLapTime) ?? Computed.Seconds(status.LastLapTime) ?? 0;
            return status.SessionTimeLeft.TotalSeconds / lap;
        }

        private static double? PerLapFuel(TelemetryState state)
        {
            return Computed.Number(state.Manager.GetPropertyValue(PerLap));
        }

        private static double? FuelLaps(TelemetryState state)
        {
            return Computed.Number(state.Manager.GetPropertyValue(LapsOfFuel));
        }

        private static double Capacity(TelemetryState state)
        {
            StatusDataBase status = state.Status;
            return state.GameName == "IRacing" ? status.CarSettings_MaxFUEL : status.MaxFuel;
        }
    }
}
