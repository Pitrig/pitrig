using System;
using System.Linq;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal static class Computed
    {
        private const double KilopascalsPerBar = 100;
        private const double MinimumSlipSpeed = 3;
        private const double DegreesPerRadian = 180 / Math.PI;
        private const double MaximumLapGain = 0.2;
        private const string LiveDelta = "PersistantTrackerPlugin.SessionBestLiveDeltaSeconds";
        private const string FuelPerLap = "DataCorePlugin.Computed.Fuel_LitersPerLap";
        private const string FuelLaps = "DataCorePlugin.Computed.Fuel_RemainingLaps";

        public static object Evaluate(PluginManager pluginManager, StatusDataBase status,
            SectorTracker sectors, FieldComputation computation)
        {
            switch (computation)
            {
                case FieldComputation.RpmPercent:
                    return Ratio(pluginManager, "Rpms", "MaxRpm");
                case FieldComputation.TurboPressure:
                    return TurboPressure(pluginManager);
                case FieldComputation.EstimatedLapTime:
                    return EstimatedLapTime(pluginManager);
                case FieldComputation.LastLapDeltaBest:
                    return LastLapDeltaBest(pluginManager);
                case FieldComputation.LiveDelta:
                    return LiveDeltaSeconds(pluginManager) * 1000;
                case FieldComputation.SectorDelta:
                    return sectors.Delta(Number(GameData(pluginManager, "CurrentSectorIndex")),
                        LiveDeltaSeconds(pluginManager));
                case FieldComputation.ClassPosition:
                    return ClassPosition(pluginManager);
                case FieldComputation.LapsRemaining:
                    return LapsRemaining(pluginManager);
                case FieldComputation.GapAhead:
                    return NeighbourGap(status, -1);
                case FieldComputation.GapBehind:
                    return NeighbourGap(status, 1);
                case FieldComputation.FuelTimeRemaining:
                    return Number(pluginManager.GetPropertyValue(FuelLaps)) * BestLapSeconds(pluginManager) * 1000;
                case FieldComputation.FuelRequired:
                    return FuelRequired(pluginManager);
                case FieldComputation.FuelToAdd:
                    return FuelToAdd(pluginManager);
                case FieldComputation.SlipAngle:
                    return SlipAngle(status);
                case FieldComputation.GearNumber:
                    return GearNumber(GameData(pluginManager, "Gear"));
                case FieldComputation.GForceLongitudinal:
                    return GForce(pluginManager, "AccelerationSurge");
                case FieldComputation.GForceLateral:
                    return GForce(pluginManager, "AccelerationSway");
                case FieldComputation.GForceVertical:
                    return GForce(pluginManager, "AccelerationHeave");
                default:
                    return null;
            }
        }

        private static object Ratio(PluginManager pluginManager, string value, string reference)
        {
            var whole = Number(GameData(pluginManager, reference));
            var part = Number(GameData(pluginManager, value));
            if (whole == null || part == null || whole.Value == 0) return null;
            return part.Value / whole.Value * 100;
        }

        private static double? TurboPressure(PluginManager pluginManager)
        {
            if (Number(GameData(pluginManager, "MaxTurboBar")) > 0)
                return Number(GameData(pluginManager, "TurboBar")) * KilopascalsPerBar;
            if (Number(GameData(pluginManager, "MaxTurbo")) > 0)
                return Number(GameData(pluginManager, "Turbo")) * KilopascalsPerBar;
            return null;
        }

        private static double? EstimatedLapTime(PluginManager pluginManager)
        {
            return (BestLapSeconds(pluginManager) + LiveDeltaSeconds(pluginManager)) * 1000;
        }

        private static double? LiveDeltaSeconds(PluginManager pluginManager)
        {
            var delta = Number(pluginManager.GetPropertyValue(LiveDelta));
            return delta >= -BestLapSeconds(pluginManager) * MaximumLapGain ? delta : null;
        }

        private static object LastLapDeltaBest(PluginManager pluginManager)
        {
            var last = GameData(pluginManager, "LastLapTime");
            var best = GameData(pluginManager, "BestLapTime");
            if (!(last is TimeSpan lastLap) || !(best is TimeSpan bestLap)) return null;
            if (lastLap <= TimeSpan.Zero || bestLap <= TimeSpan.Zero) return null;
            return (lastLap - bestLap).TotalMilliseconds;
        }

        private static double? NeighbourGap(StatusDataBase status, int offset)
        {
            var opponents = status?.Opponents;
            var player = opponents?.FirstOrDefault(opponent => opponent.IsPlayer);
            if (player == null) return null;
            var gap = opponents.FirstOrDefault(opponent => opponent.Position == player.Position + offset)?.GaptoPlayer;
            return gap == null ? (double?)null : Math.Abs(gap.Value);
        }

        private static object ClassPosition(PluginManager pluginManager)
        {
            var multipleClasses = GameData(pluginManager, "HasMultipleClassOpponents");
            if (multipleClasses == null || Convert.ToBoolean(multipleClasses)) return null;
            return GameData(pluginManager, "Position");
        }

        private static double? LapsRemaining(PluginManager pluginManager)
        {
            var total = Number(GameData(pluginManager, "TotalLaps"));
            if (total > 0) return total - Number(GameData(pluginManager, "CompletedLaps"));
            var lap = BestLapSeconds(pluginManager);
            var left = Seconds(GameData(pluginManager, "SessionTimeLeft"));
            if (lap == null || left == null) return null;
            if (left <= 0) return 1;
            var toLine = Math.Max(lap.Value - (Seconds(GameData(pluginManager, "CurrentLapTime")) ?? 0), 0);
            return 1 + Math.Ceiling(Math.Max(left.Value - toLine, 0) / lap.Value);
        }

        private static double? FuelRequired(PluginManager pluginManager)
        {
            var perLap = Number(pluginManager.GetPropertyValue(FuelPerLap));
            if (!(perLap > 0)) return null;
            var position = Number(GameData(pluginManager, "TrackPositionPercent")) ?? 0;
            var laps = LapsRemaining(pluginManager) - position;
            return laps < 0 ? 0 : laps * perLap;
        }

        private static double? FuelToAdd(PluginManager pluginManager)
        {
            var missing = FuelRequired(pluginManager) - (Number(GameData(pluginManager, "Fuel")) ?? 0);
            return missing < 0 ? 0 : missing;
        }

        private static double? SlipAngle(StatusDataBase status)
        {
            var velocity = status?.FeedbackData?.LocalVelocity;
            if (velocity == null || velocity.Forward < MinimumSlipSpeed) return null;
            return Math.Atan(velocity.Lateral / velocity.Forward) * DegreesPerRadian;
        }

        private static double? GearNumber(object gear)
        {
            switch (Convert.ToString(gear, FieldReader.Culture))
            {
                case "N":
                    return 0;
                case "R":
                    return -1;
                default:
                    return Number(gear);
            }
        }

        private static object GForce(PluginManager pluginManager, string name)
        {
            var acceleration = Number(GameData(pluginManager, name));
            if (acceleration == null) return null;
            return acceleration.Value / 9.80665;
        }

        private static double? BestLapSeconds(PluginManager pluginManager)
        {
            var best = Seconds(GameData(pluginManager, "BestLapTime"));
            return best > 0 ? best : null;
        }

        private static double? Seconds(object value)
        {
            return value is TimeSpan span ? span.TotalSeconds : (double?)null;
        }

        private static object GameData(PluginManager pluginManager, string name)
        {
            return pluginManager.GetPropertyValue("DataCorePlugin.GameData.NewData." + name)
                ?? pluginManager.GetPropertyValue("DataCorePlugin.GameData." + name);
        }

        private static double? Number(object value)
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
    }
}
