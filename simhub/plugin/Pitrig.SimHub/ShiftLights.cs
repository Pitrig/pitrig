using System;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class ShiftLights
    {
        private const double BandStart = 0.85;
        private const double GenericShare = 0.97;
        private const double RpmPerRadianPerSecond = 60 / (2 * Math.PI);
        private const double Full = 100;
        private const string IRacing = "IRacing";
        private const string RaceRoom = "RRRE";
        private const string FormulaOne = "F1";
        private const string IRacingGearLadder = "DataCorePlugin.GameRawData.Telemetry.PlayerCarSL";
        private const string IRacingCarLadder = "DataCorePlugin.GameRawData.SessionData.DriverInfo.DriverCarSL";
        private const string FormulaOneRevLights = "DataCorePlugin.GameRawData.PlayerCarTelemetryData.m_revLightsPercent";
        private const string RaceRoomUpshift = "DataCorePlugin.GameRawData.UpshiftRps";

        private PluginManager manager;
        private StatusDataBase status;
        private string game;
        private double? shiftRpm;
        private double? percent;
        private double? progress;
        private bool? reached;

        public string Source { get; private set; } = "No game";

        public double? Rpm => shiftRpm;

        public double? Percent => percent;

        public double? Progress => progress;

        public bool? Reached => reached;

        public void Update(PluginManager pluginManager, StatusDataBase current, string gameName)
        {
            manager = pluginManager;
            status = current;
            game = gameName ?? string.Empty;
            Resolve();
        }

        private void Resolve()
        {
            shiftRpm = null;
            percent = null;
            progress = null;
            reached = null;
            if (status == null)
            {
                Source = "No game";
                return;
            }
            var rpm = status.Rpms;
            var redline = Positive(status.CarSettings_CurrentGearRedLineRPM);
            if (string.Equals(game, IRacing, StringComparison.OrdinalIgnoreCase) &&
                (Ladder(IRacingGearLadder, rpm, "iRacing, this gear") ||
                 Ladder(IRacingCarLadder, rpm, "iRacing, this car")))
            {
                return;
            }
            if (game.StartsWith(FormulaOne, StringComparison.OrdinalIgnoreCase) && RevLights(rpm, redline)) return;
            if (string.Equals(game, RaceRoom, StringComparison.OrdinalIgnoreCase))
            {
                var upshift = Positive(manager.GetPropertyValue(RaceRoomUpshift));
                if (upshift != null)
                {
                    Band(upshift.Value * RpmPerRadianPerSecond, rpm, "RaceRoom upshift");
                    return;
                }
            }
            if (redline != null)
            {
                Band(redline.Value, rpm, "SimHub car settings");
                return;
            }
            var maximum = Positive(CarComputations.MaximumRpm(status));
            if (maximum != null)
            {
                Band(maximum.Value * GenericShare, rpm, "Maximum RPM");
                return;
            }
            Source = "No shift data";
        }

        private bool Ladder(string prefix, double rpm, string source)
        {
            var first = Positive(manager.GetPropertyValue(prefix + "FirstRPM"));
            var last = Positive(manager.GetPropertyValue(prefix + "LastRPM"));
            if (first == null || last == null || last.Value <= first.Value) return false;
            var shift = Positive(manager.GetPropertyValue(prefix + "ShiftRPM")) ?? last.Value;
            Set(first.Value, last.Value, shift, rpm, source);
            return true;
        }

        private bool RevLights(double rpm, double? redline)
        {
            var lights = Computed.Number(manager.GetPropertyValue(FormulaOneRevLights));
            if (lights == null) return false;
            shiftRpm = redline;
            percent = redline == null ? (double?)null : rpm / redline.Value * Full;
            progress = Math.Max(0, Math.Min(Full, lights.Value));
            reached = lights.Value >= Full;
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
            percent = rpm / shift * Full;
            progress = Math.Max(0, Math.Min(Full, (rpm - first) / (last - first) * Full));
            reached = rpm >= shift;
            Source = source;
        }

        private static double? Positive(object value)
        {
            var number = Computed.Number(value);
            return number > 0 ? number : (double?)null;
        }
    }
}
