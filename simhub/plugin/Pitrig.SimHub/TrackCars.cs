using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class TrackCars
    {
        public const int FieldCount = 4;

        private const int CarsPerField = 21;
        private const int CarUnits = 2048;
        private const int Player = 1;
        private const int Car = 2;
        private const int Ahead = 3;
        private const int Behind = 4;
        private const int Lapping = 5;
        private const int Lapped = 6;
        private const string RaceSession = "race";

        public static string[] Fields(TelemetryState state)
        {
            var fields = new string[FieldCount];
            var status = state.Status;
            if (status == null) return fields;
            var player = state.Player;
            var opponents = (status.Opponents ?? new List<Opponent>())
                .Where(car => car.TrackPositionPercent.HasValue && car.IsConnected && car.IsCarInGarage != true)
                .ToList();
            var classes = Standings.ClassIndices(opponents.Where(car => car.Position > 0).ToList());
            var racing = status.SessionTypeName?.IndexOf(RaceSession, StringComparison.OrdinalIgnoreCase) >= 0;
            var entries = opponents
                .OrderBy(car => car.Id, StringComparer.Ordinal)
                .Select(car => Encode(car.TrackPositionPercent.Value, car.IsCarInPitLane,
                    car.IsPlayer ? Player : Role(car, player, racing), ClassOf(car, classes)))
                .ToList();
            if (player == null) entries.Add(Encode(status.TrackPositionPercent, status.IsInPitLane > 0, Player, 0));
            for (var field = 0; field < FieldCount; field += 1)
            {
                var text = string.Concat(entries.Skip(field * CarsPerField).Take(CarsPerField));
                fields[field] = text.Length == 0 ? null : text;
            }
            return fields;
        }

        private static int Role(Opponent car, Opponent player, bool racing)
        {
            if (player == null) return Car;
            var sameClass = string.Equals(car.CarClass, player.CarClass, StringComparison.Ordinal);
            if (sameClass && car.PositionInClass > 0 && player.PositionInClass > 0)
            {
                if (car.PositionInClass == player.PositionInClass - 1) return Ahead;
                if (car.PositionInClass == player.PositionInClass + 1) return Behind;
            }
            if (!racing || !car.CurrentLapHighPrecision.HasValue || !player.CurrentLapHighPrecision.HasValue) return Car;
            var laps = car.CurrentLapHighPrecision.Value - player.CurrentLapHighPrecision.Value;
            if (laps >= 1) return Lapping;
            return laps <= -1 ? Lapped : Car;
        }

        private static int ClassOf(Opponent car, Dictionary<string, int> classes)
        {
            return car.CarClass != null && classes.TryGetValue(car.CarClass, out var index) ? index : 0;
        }

        private static string Encode(double fraction, bool pitLane, int role, int carClass)
        {
            var packed = ((TrackOutlineEncoder.Fraction(fraction, CarUnits)) << 1) | (pitLane ? 1 : 0);
            return new string(new[]
            {
                TrackOutlineEncoder.Digit(packed >> 6),
                TrackOutlineEncoder.Digit(packed),
                TrackOutlineEncoder.Digit(role * 8 + Math.Min(carClass, 4))
            });
        }
    }
}
