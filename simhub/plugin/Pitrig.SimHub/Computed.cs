using System;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal static class Computed
    {
        public static object Evaluate(PluginManager pluginManager, FieldComputation computation)
        {
            switch (computation)
            {
                case FieldComputation.RpmPercent:
                    return Ratio(pluginManager, "Rpms", "MaxRpm");
                case FieldComputation.FuelPercent:
                    return Ratio(pluginManager, "Fuel", "FuelCapacity");
                case FieldComputation.EstimatedLapTime:
                    return EstimatedLapTime(pluginManager);
                case FieldComputation.LapValid:
                    return LapValid(pluginManager);
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

        private static object EstimatedLapTime(PluginManager pluginManager)
        {
            var best = GameData(pluginManager, "BestLapTime");
            if (!(best is TimeSpan lap)) return null;
            var delta = Number(pluginManager.GetPropertyValue(
                "PersistantTrackerPlugin.SessionBestLiveDeltaSeconds"));
            return (lap.TotalSeconds + (delta ?? 0)) * 1000;
        }

        private static object LapValid(PluginManager pluginManager)
        {
            var invalid = GameData(pluginManager, "CurrentLapInvalid");
            if (invalid == null) return null;
            return !Convert.ToBoolean(invalid);
        }

        private static object GForce(PluginManager pluginManager, string name)
        {
            var acceleration = Number(GameData(pluginManager, name));
            if (acceleration == null) return null;
            return acceleration.Value / 9.80665;
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
