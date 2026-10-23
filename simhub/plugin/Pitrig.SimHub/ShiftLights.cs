using System;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class ShiftLights
    {
        private const double BandStart = 0.85;
        private const double GenericShare = 0.97;
        private const double RpmPerRadianPerSecond = 60 / (2 * Math.PI);
        private const double Full = 100;
        private const string CurrentGame = "DataCorePlugin.CurrentGame";
        private const string IRacing = "IRacing";
        private const string RaceRoom = "RRRE";
        private const string FormulaOne = "F1";
        private const string IRacingGearLadder = "DataCorePlugin.GameRawData.Telemetry.PlayerCarSL";
        private const string IRacingCarLadder = "DataCorePlugin.GameRawData.SessionData.DriverInfo.DriverCarSL";
        private const string FormulaOneRevLights = "DataCorePlugin.GameRawData.PlayerCarTelemetryData.m_revLightsPercent";
        private const string RaceRoomUpshift = "DataCorePlugin.GameRawData.UpshiftRps";

        private bool resolved;
        private double? shiftRpm;
        private double? progress;
        private bool? now;

        public string Source { get; private set; } = "No game";

        public void BeginTick()
        {
            resolved = false;
        }

        public double? Rpm(PluginManager pluginManager)
        {
            Resolve(pluginManager);
            return shiftRpm;
        }

        public double? Progress(PluginManager pluginManager)
        {
            Resolve(pluginManager);
            return progress;
        }

        public bool? Now(PluginManager pluginManager)
        {
            Resolve(pluginManager);
            return now;
        }

        private void Resolve(PluginManager pluginManager)
        {
            if (resolved) return;
            resolved = true;
            shiftRpm = null;
            progress = null;
            now = null;
            var rpm = Computed.Number(Computed.GameData(pluginManager, "Rpms"));
            if (rpm == null)
            {
                Source = "No game";
                return;
            }
            var game = Convert.ToString(pluginManager.GetPropertyValue(CurrentGame), FieldReader.Culture) ?? string.Empty;
            var redline = Positive(Computed.GameData(pluginManager, "CarSettings_CurrentGearRedLineRPM"));
            if (string.Equals(game, IRacing, StringComparison.OrdinalIgnoreCase) &&
                (Ladder(pluginManager, IRacingGearLadder, rpm.Value, "iRacing, this gear") ||
                 Ladder(pluginManager, IRacingCarLadder, rpm.Value, "iRacing, this car")))
            {
                return;
            }
            if (game.StartsWith(FormulaOne, StringComparison.OrdinalIgnoreCase) && RevLights(pluginManager, redline)) return;
            if (string.Equals(game, RaceRoom, StringComparison.OrdinalIgnoreCase))
            {
                var upshift = Positive(pluginManager.GetPropertyValue(RaceRoomUpshift));
                if (upshift != null)
                {
                    Band(upshift.Value * RpmPerRadianPerSecond, rpm.Value, "RaceRoom upshift");
                    return;
                }
            }
            if (redline != null)
            {
                Band(redline.Value, rpm.Value, "SimHub car settings");
                return;
            }
            var maximum = Positive(Computed.GameData(pluginManager, "MaxRpm"));
            if (maximum != null)
            {
                Band(maximum.Value * GenericShare, rpm.Value, "Maximum RPM");
                return;
            }
            Source = "No shift data";
        }

        private bool Ladder(PluginManager pluginManager, string prefix, double rpm, string source)
        {
            var first = Positive(pluginManager.GetPropertyValue(prefix + "FirstRPM"));
            var last = Positive(pluginManager.GetPropertyValue(prefix + "LastRPM"));
            if (first == null || last == null || last.Value <= first.Value) return false;
            var shift = Positive(pluginManager.GetPropertyValue(prefix + "ShiftRPM")) ?? last.Value;
            Set(first.Value, last.Value, shift, rpm, source);
            return true;
        }

        private bool RevLights(PluginManager pluginManager, double? redline)
        {
            var percent = Computed.Number(pluginManager.GetPropertyValue(FormulaOneRevLights));
            if (percent == null) return false;
            progress = Math.Max(0, Math.Min(Full, percent.Value));
            now = percent.Value >= Full;
            shiftRpm = redline;
            Source = "F1 rev lights";
            return true;
        }

        private void Band(double shift, double rpm, string source)
        {
            Set(shift * BandStart, shift, shift, rpm, source);
        }

        private void Set(double first, double last, double shift, double rpm, string source)
        {
            shiftRpm = shift;
            progress = Math.Max(0, Math.Min(Full, (rpm - first) / (last - first) * Full));
            now = rpm >= shift;
            Source = source;
        }

        private static double? Positive(object value)
        {
            var number = Computed.Number(value);
            return number > 0 ? number : (double?)null;
        }
    }
}
