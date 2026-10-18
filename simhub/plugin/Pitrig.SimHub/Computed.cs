using System;

namespace Pitrig.SimHub
{
    internal static class Computed
    {
        public static object Evaluate(TelemetryState state, FieldComputation computation)
        {
            if (WheelAverages.Covers(computation)) return state.Averages.Mean(computation);
            var status = state.Status;
            switch (computation)
            {
                case FieldComputation.RpmPercent:
                    return CarComputations.RpmPercent(status);
                case FieldComputation.ShiftPercent:
                    return CarComputations.ShiftPercent(status);
                case FieldComputation.TurboPressure:
                    return CarComputations.TurboPressure(status);
                case FieldComputation.GearNumber:
                    return CarComputations.GearNumber(status);
                case FieldComputation.GForceLongitudinal:
                    return CarComputations.GForce(status?.AccelerationSurge);
                case FieldComputation.GForceLateral:
                    return CarComputations.GForce(status?.AccelerationSway);
                case FieldComputation.GForceVertical:
                    return CarComputations.GForce(status?.AccelerationHeave);
                case FieldComputation.SlipAngle:
                    return CarComputations.SlipAngle(status);
                case FieldComputation.EstimatedLapTime:
                    return TimingComputations.EstimatedLapTime(state);
                case FieldComputation.LiveDelta:
                    return TimingComputations.LiveDelta(state);
                case FieldComputation.AllTimeLiveDelta:
                    return TimingComputations.AllTimeLiveDelta(state);
                case FieldComputation.SessionBestLap:
                    return TimingComputations.SessionBestLap(status);
                case FieldComputation.SessionBestDelta:
                    return TimingComputations.SessionBestDelta(state);
                case FieldComputation.LastLapDeltaBest:
                    return TimingComputations.LastLapDeltaBest(status);
                case FieldComputation.DeltaStatus:
                    return TimingComputations.DeltaStatus(state);
                case FieldComputation.LastLapStatus:
                    return TimingComputations.LastLapStatus(status);
                case FieldComputation.SectorStatus1:
                    return TimingComputations.SectorStatus(status, 1);
                case FieldComputation.SectorStatus2:
                    return TimingComputations.SectorStatus(status, 2);
                case FieldComputation.SectorStatus3:
                    return TimingComputations.SectorStatus(status, 3);
                case FieldComputation.SectorTime:
                    return TimingComputations.SectorTime(status);
                case FieldComputation.SectorDelta:
                    return state.Sectors.Delta;
                case FieldComputation.LapsRemaining:
                    return TimingComputations.LapsRemaining(status);
                case FieldComputation.TimedSession:
                    return TimingComputations.TimedSession(status);
                case FieldComputation.CheckeredShown:
                    return status == null ? (bool?)null : state.CheckeredShown;
                case FieldComputation.ClassPosition:
                    return RaceComputations.ClassPosition(state);
                case FieldComputation.GapAhead:
                    return RaceComputations.NeighbourGap(state, -1);
                case FieldComputation.GapBehind:
                    return RaceComputations.NeighbourGap(state, 1);
                case FieldComputation.GapLeader:
                    return RaceComputations.LeaderGap(state);
                case FieldComputation.StartingPosition:
                    return RaceComputations.StartingPosition(state);
                case FieldComputation.FuelTimeRemaining:
                    return FuelComputations.TimeRemaining(state);
                case FieldComputation.FuelRequired:
                    return FuelComputations.Required(state);
                case FieldComputation.FuelToAdd:
                    return FuelComputations.ToAdd(state);
                case FieldComputation.FuelAtFinish:
                    return FuelComputations.AtFinish(state);
                case FieldComputation.FuelPitNow:
                    return FuelComputations.PitNow(state);
                default:
                    return null;
            }
        }

        public static double? Number(object value)
        {
            if (value == null) return null;
            try
            {
                return Convert.ToDouble(value, FieldReader.Culture);
            }
            catch (Exception exception) when (exception is FormatException || exception is InvalidCastException)
            {
                return null;
            }
        }

        public static double? Seconds(TimeSpan value)
        {
            return value > TimeSpan.Zero ? value.TotalSeconds : (double?)null;
        }

        public static double? Seconds(TimeSpan? value)
        {
            return value.HasValue ? Seconds(value.Value) : null;
        }
    }
}
