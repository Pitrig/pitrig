using System;
using System.Globalization;

namespace Pitrig.SimHub
{
    internal static class VehicleSettings
    {
        private const string Iracing = "IRacing";
        private const string Ac = "AssettoCorsa";
        private const string Lmu = "LMU";
        private const string Ams2 = "Automobilista2";
        private const string F1Prefix = "F120";
        private const string IracingBrakeBias = "DataCorePlugin.GameRawData.Telemetry.dcBrakeBias";
        private const string IracingBrakeBiasFine = "DataCorePlugin.GameRawData.Telemetry.dcBrakeBiasFine";
        private const string IracingDeployMode = "DataCorePlugin.GameRawData.Telemetry.dcMGUKDeployMode";
        private const string IracingBattery = "DataCorePlugin.GameRawData.Telemetry.EnergyERSBattery";
        private const string IracingBatteryPercent = "DataCorePlugin.GameRawData.Telemetry.EnergyERSBatteryPct";
        private const string IracingDrs = "DataCorePlugin.GameRawData.Telemetry.DRS_Status";
        private const string F1DeployMode = "DataCorePlugin.GameRawData.PlayerCarStatusData.m_ersDeployMode";
        private const string Ams2DeployMode = "DataCorePlugin.GameRawData.mErsDeploymentMode";
        private const string PowerLevel = "DataCorePlugin.GameRawData.Physics.ErsPowerLevel";
        private const string RecoveryLevel = "DataCorePlugin.GameRawData.Physics.ErsRecoveryLevel";
        private const string KersCharge = "DataCorePlugin.GameRawData.Physics.KersCharge";
        private const string AcHasErs = "DataCorePlugin.GameRawData.StaticInfo.HasERS";
        private const string AcDrsAvailable = "DataCorePlugin.GameRawData.Physics.DrsAvailable";
        private const string AcDrsEnabled = "DataCorePlugin.GameRawData.Physics.DrsEnabled";
        private const string LmuMotorMapMaximum = "DataCorePlugin.GameRawData.PlayerNativeTelemetry.mMotorMapMax";
        private const int IracingDrsAvailable = 2;
        private const int IracingDrsOpen = 3;

        public static double? BrakeBias(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            if (state.GameName != Iracing) return status.BrakeBias;
            return Raw(state, IracingBrakeBias) + (Raw(state, IracingBrakeBiasFine) ?? 0);
        }

        public static string EngineMap(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var map = status.EngineMap;
            if (state.GameName != Lmu) return map < 0 ? null : Text(map);
            switch (status.CarClass)
            {
                case "LMP3":
                    return "R";
                case "Hyper":
                    var maximum = Whole(state, LmuMotorMapMaximum);
                    if (maximum >= 10) return map > 0 ? Text(map * 20) : "OFF";
                    if (maximum >= 5) return map > 0 ? Text(map * 10) : "OFF";
                    return Text(map);
                default:
                    return map == 0 ? "SC" : "R";
            }
        }

        public static string ErsDeployMode(TelemetryState state)
        {
            if (state.Status == null || !ShowsErs(state)) return null;
            var game = state.GameName ?? string.Empty;
            if (game == Iracing) return IracingDeployName(Whole(state, IracingDeployMode));
            if (game.StartsWith(F1Prefix, StringComparison.Ordinal)) return F1DeployName(Whole(state, F1DeployMode));
            if (game == Ams2) return Ams2DeployName(Mode(state, Ams2DeployMode));
            return DeployName(Mode(state, PowerLevel));
        }

        public static string ErsRecoveryMode(TelemetryState state)
        {
            if (state.Status == null) return null;
            var level = Raw(state, RecoveryLevel);
            if (level == null) return null;
            if (level < 0) return "BUI";
            return level > 0 ? "DEP" : "OFF";
        }

        public static double? ErsPercent(TelemetryState state)
        {
            var status = state.Status;
            if (status == null || !ShowsErs(state)) return null;
            switch (state.GameName)
            {
                case Iracing:
                    return Math.Floor((Raw(state, IracingBatteryPercent) ?? 0) * 100);
                case Ac:
                    return Math.Floor((Raw(state, KersCharge) ?? 0) * 100);
                default:
                    return status.ERSPercent > 0 ? Math.Round(status.ERSPercent, MidpointRounding.AwayFromZero) : (double?)null;
            }
        }

        public static bool? DrsAvailable(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            switch (state.GameName)
            {
                case Iracing:
                    return Whole(state, IracingDrs) == IracingDrsAvailable;
                case Ac:
                    return Whole(state, AcDrsAvailable) != 0;
                default:
                    return status.DRSAvailable != 0;
            }
        }

        public static bool? DrsActive(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            switch (state.GameName)
            {
                case Iracing:
                    return Whole(state, IracingDrs) == IracingDrsOpen;
                case Ac:
                    return Whole(state, AcDrsEnabled) != 0;
                default:
                    return status.DRSEnabled != 0;
            }
        }

        private static bool ShowsErs(TelemetryState state)
        {
            var game = state.GameName;
            var battery = game == Iracing ? Raw(state, IracingBattery) : null;
            var available = game == Ac && Whole(state, AcHasErs) != 0;
            var percent = game == Iracing ? Raw(state, IracingBatteryPercent) : state.Status.ERSPercent;
            return battery > 0 || available || percent > 0;
        }

        private static string IracingDeployName(int mode)
        {
            switch (mode)
            {
                case 0:
                    return "QUAL";
                case 1:
                case 25:
                    return "ATTACK";
                case 2:
                case 50:
                    return "BALANCED";
                case 3:
                case 75:
                    return "BUILD";
                default:
                    return "NO DEPLOY";
            }
        }

        private static string F1DeployName(int mode)
        {
            switch (mode)
            {
                case 0:
                    return "NO DEPLOY";
                case 1:
                    return "MEDIUM";
                case 2:
                    return "HOTLAP";
                case 3:
                    return "OVERTAKE";
                default:
                    return "ERS" + mode.ToString(CultureInfo.InvariantCulture);
            }
        }

        private static string Ams2DeployName(double mode)
        {
            switch (mode)
            {
                case 2:
                    return "BUILD";
                case 3:
                    return "BALANCED";
                case 4:
                    return "ATTACK";
                case 5:
                    return "QUALI";
                default:
                    return "NO DEPLOY";
            }
        }

        private static string DeployName(double mode)
        {
            switch (mode)
            {
                case 0:
                    return "NO DEPLOY";
                case 1:
                    return "BUILD";
                case 2:
                    return "LOW";
                case 3:
                    return "BALANCED";
                case 4:
                    return "HIGH";
                default:
                    return "ATTACK";
            }
        }

        private static double Mode(TelemetryState state, string property)
        {
            return Raw(state, property) ?? 0;
        }

        private static int Whole(TelemetryState state, string property)
        {
            return Computed.Integer(state.Manager.GetPropertyValue(property));
        }

        private static double? Raw(TelemetryState state, string property)
        {
            return Computed.Number(state.Manager.GetPropertyValue(property));
        }

        private static string Text(double value)
        {
            return value.ToString(CultureInfo.InvariantCulture);
        }
    }
}
