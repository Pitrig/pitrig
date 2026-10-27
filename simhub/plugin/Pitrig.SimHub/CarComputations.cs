using System;
using System.Globalization;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class CarComputations
    {
        private const double KilopascalsPerBar = 100;
        private const double MinimumSlipSpeed = 3;
        private const double DegreesPerRadian = 180 / Math.PI;
        private const double StandardGravity = 9.80665;

        public static double? RpmPercent(StatusDataBase status)
        {
            return status == null ? null : Percent(status.Rpms, MaximumRpm(status));
        }

        public static double MaximumRpm(StatusDataBase status)
        {
            return status.CarSettings_MaxRPM > 0 ? status.CarSettings_MaxRPM : status.MaxRpm;
        }

        public static double? TurboPressure(StatusDataBase status)
        {
            if (status == null) return null;
            if (status.MaxTurboBar > 0) return status.TurboBar * KilopascalsPerBar;
            if (status.MaxTurbo > 0) return status.Turbo * KilopascalsPerBar;
            return null;
        }

        public static double? GearNumber(StatusDataBase status)
        {
            switch (status?.Gear)
            {
                case null:
                    return null;
                case "N":
                    return 0;
                case "R":
                    return -1;
                default:
                    return double.TryParse(status.Gear, NumberStyles.Float, FieldReader.Culture, out var gear)
                        ? gear
                        : (double?)null;
            }
        }

        public static double? GForce(double? acceleration)
        {
            return acceleration / StandardGravity;
        }

        public static double? SlipAngle(StatusDataBase status)
        {
            var velocity = status?.FeedbackData?.LocalVelocity;
            if (velocity == null || velocity.Forward < MinimumSlipSpeed) return null;
            return Math.Atan(velocity.Lateral / velocity.Forward) * DegreesPerRadian;
        }

        private static double? Percent(double part, double whole)
        {
            return whole > 0 ? part / whole * 100 : (double?)null;
        }
    }
}
