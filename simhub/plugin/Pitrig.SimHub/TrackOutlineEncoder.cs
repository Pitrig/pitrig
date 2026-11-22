using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Pitrig.SimHub
{
    internal static class TrackOutlineEncoder
    {
        public const int LapUnits = 4096;

        private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        private const char Version = 'B';
        private const int PieceDigits = 59;
        private const int MaximumPieces = 63;
        private const int GridMaximum = 4095;
        private const double StepLimit = 30;
        private const int MaximumSectors = 15;
        private const uint FnvOffset = 2166136261;
        private const uint FnvPrime = 16777619;

        public static char Digit(int value)
        {
            return Alphabet[value & 63];
        }

        public static int Fraction(double fraction, int units)
        {
            return (int)Math.Round(TrackOutline.Wrap(fraction) * units) & (units - 1);
        }

        public static string[] Pieces(TrackOutline outline)
        {
            var body = outline == null || !outline.Usable ? EmptyBody() : Body(outline);
            if (body == null) body = EmptyBody();
            var count = (body.Length + PieceDigits - 1) / PieceDigits;
            if (count > MaximumPieces) return Pieces(null);
            var id = (int)(Hash(body) & (LapUnits - 1));
            var pieces = new string[count];
            for (var index = 0; index < count; index += 1)
            {
                var start = index * PieceDigits;
                var payload = body.Substring(start, Math.Min(PieceDigits, body.Length - start));
                pieces[index] = new string(new[] { Digit(index), Digit(count), Digit(id >> 6), Digit(id) }) + payload;
            }
            return pieces;
        }

        private static string EmptyBody()
        {
            var text = new StringBuilder();
            text.Append(Version);
            for (var index = 0; index < 5; index += 1) AppendTwo(text, 0);
            text.Append(Digit(0));
            return Checked(text);
        }

        private static string Body(TrackOutline outline)
        {
            var track = outline.Points;
            var pit = outline.HasPitLane ? outline.Pit.Points : new double[0][];
            var all = track.Concat(pit).ToList();
            var minimumX = all.Min(point => point[0]);
            var minimumY = all.Min(point => point[1]);
            var extent = Math.Max(all.Max(point => point[0]) - minimumX, all.Max(point => point[1]) - minimumY);
            var step = Math.Max(LargestStep(track), LargestStep(pit));
            if (extent <= 0 || step <= 0) return null;
            var scale = Math.Min(GridMaximum / extent, StepLimit / step);
            var sectors = (outline.Sectors ?? new double[0]).Take(MaximumSectors).ToList();
            var text = new StringBuilder();
            text.Append(Version);
            AppendTwo(text, track.Length);
            AppendTwo(text, pit.Length);
            AppendTwo(text, outline.HasPitLane ? Fraction(outline.Pit.From, LapUnits) : 0);
            AppendTwo(text, outline.HasPitLane ? Fraction(outline.Pit.To, LapUnits) : 0);
            AppendTwo(text, Fraction(outline.Finish, LapUnits));
            text.Append(Digit(sectors.Count));
            foreach (var sector in sectors) AppendTwo(text, Fraction(sector, LapUnits));
            AppendLine(text, track, minimumX, minimumY, scale);
            AppendLine(text, pit, minimumX, minimumY, scale);
            return Checked(text);
        }

        private static double LargestStep(IList<double[]> line)
        {
            var largest = 0.0;
            for (var index = 1; index < line.Count; index += 1)
            {
                largest = Math.Max(largest, Math.Abs(line[index][0] - line[index - 1][0]));
                largest = Math.Max(largest, Math.Abs(line[index][1] - line[index - 1][1]));
            }
            return largest;
        }

        private static void AppendLine(StringBuilder text, IList<double[]> line, double minimumX, double minimumY,
            double scale)
        {
            if (line.Count == 0) return;
            var x = Grid((line[0][0] - minimumX) * scale);
            var y = Grid((line[0][1] - minimumY) * scale);
            AppendTwo(text, x);
            AppendTwo(text, y);
            for (var index = 1; index < line.Count; index += 1)
            {
                var stepX = Step(Grid((line[index][0] - minimumX) * scale) - x);
                var stepY = Step(Grid((line[index][1] - minimumY) * scale) - y);
                x += stepX;
                y += stepY;
                text.Append(Digit(stepX));
                text.Append(Digit(stepY));
            }
        }

        private static int Grid(double value)
        {
            return (int)Math.Max(0, Math.Min(GridMaximum, Math.Round(value)));
        }

        private static int Step(int delta)
        {
            return Math.Max(-32, Math.Min(31, delta));
        }

        private static void AppendTwo(StringBuilder text, int value)
        {
            text.Append(Digit(value >> 6));
            text.Append(Digit(value));
        }

        private static string Checked(StringBuilder text)
        {
            var sum = 0;
            for (var index = 0; index < text.Length; index += 1)
            {
                sum = (sum + Alphabet.IndexOf(text[index])) % LapUnits;
            }
            AppendTwo(text, sum);
            return text.ToString();
        }

        private static uint Hash(string text)
        {
            var hash = FnvOffset;
            foreach (var character in text)
            {
                hash = (hash ^ character) * FnvPrime;
            }
            return hash;
        }
    }
}
