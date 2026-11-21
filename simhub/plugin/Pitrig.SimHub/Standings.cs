using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal sealed class Standings
    {
        private const int NameLength = 12;
        private const int CarLength = 22;
        private const int ClassLength = 4;
        private const int ClassColours = 4;
        private const string RaceSession = "race";

        private static readonly Dictionary<FieldComputation, Func<Standings, object>> Fields =
            new Dictionary<FieldComputation, Func<Standings, object>>
            {
                { FieldComputation.StandingsLeaderName, s => s.overall.Leader.Name },
                { FieldComputation.StandingsLeaderCar, s => s.overall.Leader.Car },
                { FieldComputation.StandingsLeaderClass, s => s.overall.Leader.Class },
                { FieldComputation.StandingsLeaderClassIndex, s => s.overall.Leader.ClassIndex },
                { FieldComputation.StandingsLeaderLastLap, s => s.overall.Leader.LastLap },
                { FieldComputation.StandingsAheadPosition, s => s.overall.Ahead.Position },
                { FieldComputation.StandingsAheadName, s => s.overall.Ahead.Name },
                { FieldComputation.StandingsAheadCar, s => s.overall.Ahead.Car },
                { FieldComputation.StandingsAheadClass, s => s.overall.Ahead.Class },
                { FieldComputation.StandingsAheadClassIndex, s => s.overall.Ahead.ClassIndex },
                { FieldComputation.StandingsAheadGap, s => s.overall.Ahead.Gap },
                { FieldComputation.StandingsPlayerClass, s => s.overall.Player.Class },
                { FieldComputation.StandingsPlayerClassIndex, s => s.overall.Player.ClassIndex },
                { FieldComputation.StandingsPlayerCar, s => s.overall.Player.Car },
                { FieldComputation.StandingsPlayerGap, s => s.overall.Player.Gap },
                { FieldComputation.StandingsBehindPosition, s => s.overall.Behind.Position },
                { FieldComputation.StandingsBehindName, s => s.overall.Behind.Name },
                { FieldComputation.StandingsBehindCar, s => s.overall.Behind.Car },
                { FieldComputation.StandingsBehindClass, s => s.overall.Behind.Class },
                { FieldComputation.StandingsBehindClassIndex, s => s.overall.Behind.ClassIndex },
                { FieldComputation.StandingsBehindGap, s => s.overall.Behind.Gap },
                { FieldComputation.ClassStandingsLeaderName, s => s.inClass.Leader.Name },
                { FieldComputation.ClassStandingsLeaderCar, s => s.inClass.Leader.Car },
                { FieldComputation.ClassStandingsLeaderLastLap, s => s.inClass.Leader.LastLap },
                { FieldComputation.ClassStandingsAheadPosition, s => s.inClass.Ahead.Position },
                { FieldComputation.ClassStandingsAheadName, s => s.inClass.Ahead.Name },
                { FieldComputation.ClassStandingsAheadCar, s => s.inClass.Ahead.Car },
                { FieldComputation.ClassStandingsAheadGap, s => s.inClass.Ahead.Gap },
                { FieldComputation.ClassStandingsAheadInterval, s => s.inClass.Ahead.Interval },
                { FieldComputation.ClassStandingsPlayerGap, s => s.inClass.Player.Gap },
                { FieldComputation.ClassStandingsBehindPosition, s => s.inClass.Behind.Position },
                { FieldComputation.ClassStandingsBehindName, s => s.inClass.Behind.Name },
                { FieldComputation.ClassStandingsBehindCar, s => s.inClass.Behind.Car },
                { FieldComputation.ClassStandingsBehindGap, s => s.inClass.Behind.Gap },
                { FieldComputation.ClassStandingsBehindInterval, s => s.inClass.Behind.Interval }
            };

        private Board overall = new Board();
        private Board inClass = new Board();
        private double refreshedAt = double.NaN;

        public static bool Covers(FieldComputation computation)
        {
            return Fields.ContainsKey(computation);
        }

        public object Value(TelemetryState state, FieldComputation computation)
        {
            if (!state.Now.Equals(refreshedAt)) Refresh(state);
            return Fields[computation](this);
        }

        private void Refresh(TelemetryState state)
        {
            refreshedAt = state.Now;
            var player = state.Player;
            var opponents = state.Status?.Opponents;
            if (player == null || opponents == null)
            {
                overall = new Board();
                inClass = new Board();
                return;
            }
            var racing = state.Status.SessionTypeName?.IndexOf(RaceSession, StringComparison.OrdinalIgnoreCase) >= 0;
            var cars = opponents.Where(car => car.Position > 0).OrderBy(car => car.Position).ToList();
            var indices = ClassIndices(cars);
            overall = Build(cars, player, car => car.Position, indices, racing, false);
            var classmates = cars.Where(car => car.CarClass == player.CarClass && car.PositionInClass > 0)
                .OrderBy(car => car.PositionInClass).ToList();
            inClass = Build(classmates, player, car => car.PositionInClass, indices, racing, true);
        }

        private static Board Build(List<Opponent> cars, Opponent player, Func<Opponent, int> place,
            Dictionary<string, int> indices, bool racing, bool inClass)
        {
            var board = new Board();
            if (cars.Count == 0) return board;
            var leader = cars[0];
            var mine = place(player);
            var ahead = mine > 2 ? cars.FirstOrDefault(car => place(car) == mine - 1) : null;
            var behind = mine > 0 ? cars.FirstOrDefault(car => place(car) == mine + 1) : null;
            board.Leader = Describe(leader, place, indices);
            board.Leader.LastLap = Milliseconds(leader.LastLapTime);
            board.Ahead = Describe(ahead, place, indices);
            board.Ahead.Gap = GapToLeader(ahead, leader, racing, inClass);
            board.Ahead.Interval = Interval(ahead, player, racing);
            board.Player = Describe(player, place, indices);
            board.Player.Gap = GapToLeader(player, leader, racing, inClass);
            board.Behind = Describe(behind, place, indices);
            board.Behind.Gap = GapToLeader(behind, leader, racing, inClass);
            board.Behind.Interval = Interval(behind, player, racing);
            return board;
        }

        private static Row Describe(Opponent car, Func<Opponent, int> place, Dictionary<string, int> indices)
        {
            if (car == null) return new Row();
            var position = place(car);
            return new Row
            {
                Position = position > 0 ? position : (int?)null,
                Name = Surname(car.Name),
                Car = Trim(car.CarName, CarLength),
                Class = ShortClass(car.CarClass),
                ClassIndex = car.CarClass != null && indices.TryGetValue(car.CarClass, out var index)
                    ? index
                    : (int?)null
            };
        }

        internal static Dictionary<string, int> ClassIndices(List<Opponent> cars)
        {
            var classes = cars.Where(car => !string.IsNullOrEmpty(car.CarClass))
                .GroupBy(car => car.CarClass)
                .Select(group => new
                {
                    Name = group.Key,
                    Best = group.Select(car => Computed.Seconds(car.BestLapTime)).Min() ?? double.MaxValue
                })
                .OrderBy(entry => entry.Best)
                .ToList();
            var indices = new Dictionary<string, int>();
            if (classes.Count < 2) return indices;
            for (var rank = 0; rank < classes.Count; rank++)
            {
                indices[classes[rank].Name] = Math.Min(rank + 1, ClassColours);
            }
            return indices;
        }

        private static string GapToLeader(Opponent car, Opponent leader, bool racing, bool inClass)
        {
            if (car == null || ReferenceEquals(car, leader)) return null;
            if (racing)
            {
                var laps = inClass ? car.LapsToClassLeader : car.LapsToLeader;
                if (laps >= 1) return "+" + laps.Value.ToString(CultureInfo.InvariantCulture) + (laps == 1 ? " LAP" : " LAPS");
                return Signed(inClass ? car.GaptoClassLeader : car.GaptoLeader);
            }
            return Signed(Computed.Seconds(car.BestLapTime) - Computed.Seconds(leader.BestLapTime));
        }

        private static string Interval(Opponent car, Opponent player, bool racing)
        {
            if (car == null) return null;
            var gap = racing
                ? car.GaptoPlayer
                : Computed.Seconds(car.BestLapTime) - Computed.Seconds(player.BestLapTime);
            return gap == null ? null : Math.Abs(gap.Value).ToString("0.000", CultureInfo.InvariantCulture);
        }

        private static string Signed(double? seconds)
        {
            return seconds == null ? null : "+" + Math.Abs(seconds.Value).ToString("0.000", CultureInfo.InvariantCulture);
        }

        private static double? Milliseconds(TimeSpan lap)
        {
            return Computed.Seconds(lap) * 1000;
        }

        private static string Surname(string name)
        {
            var words = name?.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
            return words == null || words.Length == 0
                ? null
                : Trim(words[words.Length - 1].ToUpperInvariant(), NameLength);
        }

        private static string ShortClass(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            var compact = new string(name.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
            if (compact.Contains("HYPER")) return "HYP";
            if (compact.Contains("GT3")) return "GT3";
            if (compact.Contains("GTE")) return "GTE";
            if (compact.Contains("GT4")) return "GT4";
            return Trim(compact, ClassLength);
        }

        private static string Trim(string text, int length)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            var clean = text.Trim();
            return clean.Length > length ? clean.Substring(0, length) : clean;
        }

        private sealed class Board
        {
            public Row Leader = new Row();
            public Row Ahead = new Row();
            public Row Player = new Row();
            public Row Behind = new Row();
        }

        private sealed class Row
        {
            public int? Position;
            public string Name;
            public string Car;
            public string Class;
            public int? ClassIndex;
            public double? LastLap;
            public string Gap;
            public string Interval;
        }
    }
}
