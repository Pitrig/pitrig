using System;
using System.IO;
using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal sealed class TrackIdentity
    {
        private static readonly char[] Invalid = Path.GetInvalidFileNameChars();

        private TrackIdentity(string game, string id, string name, string code, string configuration, double? length)
        {
            Game = game;
            Id = id;
            Name = name;
            Code = code;
            Configuration = configuration;
            LengthMeters = length;
        }

        public string Game { get; }

        public string Id { get; }

        public string Name { get; }

        public string Code { get; }

        public string Configuration { get; }

        public double? LengthMeters { get; }

        public string Key => Game + "|" + Id + "|" + Configuration;

        public string FileName => new string((Id + (string.IsNullOrEmpty(Configuration) ? "" : "-" + Configuration))
            .Select(character => Invalid.Contains(character) ? '_' : character).ToArray());

        public static TrackIdentity Of(string game, StatusDataBase status)
        {
            if (status == null || string.IsNullOrWhiteSpace(game)) return null;
            var id = First(status.TrackId, status.TrackCode, status.TrackName);
            if (id == null) return null;
            var length = status.TrackLength > 0 ? status.TrackLength : (double?)null;
            return new TrackIdentity(game, id, status.TrackName, status.TrackCode, Blank(status.TrackConfig), length);
        }

        public bool Matches(string name, string configuration)
        {
            var named = Same(name, Id) || Same(name, Name) || Same(name, Code);
            return named && Same(Blank(configuration), Configuration);
        }

        public bool NamedIn(string fileName)
        {
            return Contains(fileName, Id) || Contains(fileName, Name) || Contains(fileName, Code);
        }

        public double[] MapPoint(double x, double z)
        {
            return new[] { x, z };
        }

        private static bool Same(string left, string right)
        {
            return string.Equals(Compact(left), Compact(right), StringComparison.OrdinalIgnoreCase);
        }

        private static bool Contains(string text, string part)
        {
            var compact = Compact(part);
            return !string.IsNullOrEmpty(compact) &&
                   Compact(text).IndexOf(compact, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string Compact(string text)
        {
            return text == null ? string.Empty : new string(text.Where(char.IsLetterOrDigit).ToArray());
        }

        private static string Blank(string text)
        {
            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }

        private static string First(params string[] values)
        {
            return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();
        }
    }
}
