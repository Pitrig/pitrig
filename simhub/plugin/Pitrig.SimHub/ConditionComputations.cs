using System;
using System.Globalization;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class ConditionComputations
    {
        private const string Acc = "AssettoCorsaCompetizione";
        private const double AccRepairMsPerDamage = 284;
        private const int AccBodyworkZone = 4;
        private const string AccGrip = "DataCorePlugin.GameRawData.Graphics.trackGripStatus";
        private const string IracingWetness = "DataCorePlugin.GameRawData.Telemetry.TrackWetness";
        private const string LmuWetness = "DataCorePlugin.GameRawData.Data.mAvgPathWetness";
        private const string IracingRepair = "DataCorePlugin.GameRawData.Telemetry.PitRepairLeft";
        private const string IracingOptionalRepair = "DataCorePlugin.GameRawData.Telemetry.PitOptRepairLeft";

        private static readonly string[] AccConditions = { "GRN", "FST", "OPT", "GRS", "DMP", "WET", "FLD" };
        private static readonly string[] IracingConditions = { "DRY", "GRS", "DMP", "LIT", "MOD", "VER", "EXT" };

        public static string DamageGrade(TelemetryState state, int zone)
        {
            var status = state.Status;
            if (status == null) return null;
            var damage = Zone(status, zone);
            return damage >= 0
                ? Math.Round(damage, MidpointRounding.AwayFromZero).ToString(CultureInfo.InvariantCulture)
                : null;
        }

        public static double? RepairTime(TelemetryState state)
        {
            if (state.Status == null) return null;
            if (state.GameName == Acc) return ZoneRepairTime(state, AccBodyworkZone);
            return (Raw(state, IracingRepair) + (Raw(state, IracingOptionalRepair) ?? 0)) * 1000;
        }

        public static double? ZoneRepairTime(TelemetryState state, int zone)
        {
            var status = state.Status;
            if (status == null || state.GameName != Acc) return null;
            return Zone(status, zone) * AccRepairMsPerDamage;
        }

        public static string TrackCondition(TelemetryState state)
        {
            if (state.Status == null) return null;
            switch (state.GameName)
            {
                case Acc:
                    return Named(Raw(state, AccGrip), AccConditions, 0) ?? "N/A";
                case "IRacing":
                    return Named(Raw(state, IracingWetness), IracingConditions, 1) ?? "---";
                case "LMU":
                    return Wetness((Raw(state, LmuWetness) ?? 0) * 100);
                default:
                    return null;
            }
        }

        private static double Zone(StatusDataBase status, int zone)
        {
            switch (zone)
            {
                case 0:
                    return status.CarDamage1;
                case 1:
                    return status.CarDamage2;
                case 2:
                    return status.CarDamage3;
                case 3:
                    return status.CarDamage4;
                default:
                    return status.CarDamage5;
            }
        }

        private static string Named(double? value, string[] names, int first)
        {
            if (value == null || value != Math.Floor(value.Value)) return null;
            var index = (int)value.Value - first;
            return index >= 0 && index < names.Length ? names[index] : null;
        }

        private static string Wetness(double percent)
        {
            if (percent > 79) return "FLD";
            if (percent > 59) return "EXT";
            if (percent > 39) return "WET";
            if (percent > 12) return "DMP";
            return percent > 4 ? "GRS" : "DRY";
        }

        private static double? Raw(TelemetryState state, string property)
        {
            return Computed.Number(state.Manager.GetPropertyValue(property));
        }
    }
}
