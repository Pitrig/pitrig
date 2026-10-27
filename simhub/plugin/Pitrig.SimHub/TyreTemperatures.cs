using System.Collections.Generic;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class TyreTemperatures
    {
        private const string Lmu = "LMU";
        private const string LmuWheel = "DataCorePlugin.GameRawData.CurrentPlayerTelemetry.mWheels0";
        private const double CarcassShare = 0.335;
        private const double LayerShare = 0.22;
        private const double KelvinOffset = 273.15;

        private static readonly Dictionary<FieldComputation, int> Wheels = new Dictionary<FieldComputation, int>
        {
            { FieldComputation.TyreTemperatureFrontLeft, 0 },
            { FieldComputation.TyreTemperatureFrontRight, 1 },
            { FieldComputation.TyreTemperatureRearLeft, 2 },
            { FieldComputation.TyreTemperatureRearRight, 3 }
        };

        public static bool Covers(FieldComputation computation)
        {
            return Wheels.ContainsKey(computation);
        }

        public static double? Live(TelemetryState state, FieldComputation computation)
        {
            return state.Status == null ? null : Reading(state, Wheels[computation]);
        }

        public static double? Reading(TelemetryState state, int wheel)
        {
            var status = state.Status;
            if (state.GameName != Lmu) return Generic(status, wheel);
            var prefix = LmuWheel + (wheel + 1) + ".";
            var carcass = Raw(state, prefix + "mTireCarcassTemperature");
            var first = Raw(state, prefix + "mTireInnerLayerTemperature01");
            var second = Raw(state, prefix + "mTireInnerLayerTemperature02");
            var third = Raw(state, prefix + "mTireInnerLayerTemperature03");
            if (carcass == null || first == null || second == null || third == null) return 0;
            var kelvin = carcass.Value * CarcassShare + first.Value * LayerShare + second.Value * LayerShare +
                         third.Value * LayerShare;
            switch (status.TemperatureUnit)
            {
                case "Celcius":
                    return kelvin - KelvinOffset;
                case "Fahrenheit":
                    return (kelvin - KelvinOffset) * 9 / 5 + 32;
                default:
                    return kelvin;
            }
        }

        private static double Generic(StatusDataBase status, int wheel)
        {
            switch (wheel)
            {
                case 0:
                    return status.TyreTemperatureFrontLeft;
                case 1:
                    return status.TyreTemperatureFrontRight;
                case 2:
                    return status.TyreTemperatureRearLeft;
                default:
                    return status.TyreTemperatureRearRight;
            }
        }

        private static double? Raw(TelemetryState state, string property)
        {
            return Computed.Number(state.Manager.GetPropertyValue(property));
        }
    }
}
