using System;
using System.Globalization;

namespace Pitrig.SimHub
{
    internal static class Computed
    {
        public static object Evaluate(TelemetryState state, FieldComputation computation)
        {
            if (WheelAverages.Covers(computation)) return state.Averages.Mean(computation);
            if (TyreTemperatures.Covers(computation)) return TyreTemperatures.Live(state, computation);
            var status = state.Status;
            switch (computation)
            {
                case FieldComputation.RpmPercent:
                    return CarComputations.RpmPercent(status);
                case FieldComputation.ShiftRpm:
                    return state.Shifts.Rpm;
                case FieldComputation.ShiftPercent:
                    return state.Shifts.Percent;
                case FieldComputation.ShiftProgress:
                    return state.Shifts.Progress;
                case FieldComputation.RedlineReached:
                    return state.Shifts.Reached;
                case FieldComputation.TurboPressure:
                    return CarComputations.TurboPressure(status);
                case FieldComputation.BrakeBias:
                    return VehicleSettings.BrakeBias(state);
                case FieldComputation.EngineMap:
                    return VehicleSettings.EngineMap(state);
                case FieldComputation.ErsDeployMode:
                    return VehicleSettings.ErsDeployMode(state);
                case FieldComputation.ErsRecoveryMode:
                    return VehicleSettings.ErsRecoveryMode(state);
                case FieldComputation.ErsPercent:
                    return VehicleSettings.ErsPercent(state);
                case FieldComputation.DrsAvailable:
                    return VehicleSettings.DrsAvailable(state);
                case FieldComputation.DrsActive:
                    return VehicleSettings.DrsActive(state);
                case FieldComputation.DamageFront:
                    return ConditionComputations.DamageGrade(state, 0);
                case FieldComputation.DamageRear:
                    return ConditionComputations.DamageGrade(state, 1);
                case FieldComputation.DamageLeft:
                    return ConditionComputations.DamageGrade(state, 2);
                case FieldComputation.DamageRight:
                    return ConditionComputations.DamageGrade(state, 3);
                case FieldComputation.DamageRepairTime:
                    return ConditionComputations.RepairTime(state);
                case FieldComputation.TrackCondition:
                    return ConditionComputations.TrackCondition(state);
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
                    return SectorComputations.Status(state, 1);
                case FieldComputation.SectorStatus2:
                    return SectorComputations.Status(state, 2);
                case FieldComputation.SectorStatus3:
                    return SectorComputations.Status(state, 3);
                case FieldComputation.SectorTime:
                    return SectorComputations.Running(state);
                case FieldComputation.SectorBox1:
                    return SectorComputations.Box(state, 1);
                case FieldComputation.SectorBox2:
                    return SectorComputations.Box(state, 2);
                case FieldComputation.SectorBox3:
                    return SectorComputations.Box(state, 3);
                case FieldComputation.SectorBest1:
                    return SectorComputations.BestTime(state, 1);
                case FieldComputation.SectorBest2:
                    return SectorComputations.BestTime(state, 2);
                case FieldComputation.SectorBest3:
                    return SectorComputations.BestTime(state, 3);
                case FieldComputation.SectorDelta:
                    return state.Sectors.Delta;
                case FieldComputation.LapValid:
                    return state.Validity.Valid(state);
                case FieldComputation.LapInvalid:
                    return state.Validity.Invalid(state);
                case FieldComputation.LapsRemaining:
                    return TimingComputations.LapsRemaining(state);
                case FieldComputation.TimedSession:
                    return SessionComputations.TimedSession(state);
                case FieldComputation.SessionType:
                    return SessionComputations.SessionType(state);
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
                case FieldComputation.FuelRequired:
                    return FuelComputations.Required(state);
                case FieldComputation.FuelToAdd:
                    return FuelComputations.ToAdd(state);
                case FieldComputation.FuelAtFinish:
                    return FuelComputations.AtFinish(state);
                case FieldComputation.FuelPitNow:
                    return FuelComputations.PitNow(state);
                case FieldComputation.InputButtons:
                    return state.Inputs.TakeButtons();
                case FieldComputation.InputSwitch:
                    return state.Inputs.Position;
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

        public static int Integer(object value)
        {
            return int.TryParse(value?.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var number)
                ? number
                : 0;
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
