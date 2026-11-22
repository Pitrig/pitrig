using System;
using System.Collections.Generic;
using System.Linq;

namespace Pitrig.SimHub
{
    internal sealed class TrackOutline
    {
        private const double PointSpacingMeters = 10;
        private const int MinimumPoints = 128;
        private const int MaximumPoints = 512;
        private const int MaximumPitPoints = 255;

        public double[][] Points { get; set; }

        public PitLane Pit { get; set; }

        public double Finish { get; set; }

        public double[] Sectors { get; set; } = new double[0];

        public bool HasPitLane => Pit != null && Pit.Usable;

        public bool Usable => Points != null && Points.Length >= 3 && Points.All(point => point != null && point.Length == 2);

        public TrackOutline Copy()
        {
            return (TrackOutline)MemberwiseClone();
        }

        public static int PointCount(double lengthMeters)
        {
            var count = double.IsNaN(lengthMeters) ? MaximumPoints : Math.Round(lengthMeters / PointSpacingMeters);
            return (int)Math.Max(MinimumPoints, Math.Min(MaximumPoints, count));
        }

        public static int PitPointCount(double spanMeters)
        {
            return (int)Math.Max(2, Math.Min(MaximumPitPoints, Math.Round(spanMeters / PointSpacingMeters)));
        }

        public static double Wrap(double fraction)
        {
            return fraction - Math.Floor(fraction);
        }

        public static double[][] ResampleLoop(List<double[]> samples, int count)
        {
            var ordered = samples.Where(sample => !double.IsNaN(sample[0]))
                .Select(sample => new[] { Wrap(sample[0]), sample[1], sample[2] })
                .OrderBy(sample => sample[0])
                .ToList();
            if (ordered.Count < 3) return null;
            var points = new double[count][];
            for (var index = 0; index < count; index += 1)
            {
                points[index] = LoopAt(ordered, (double)index / count);
            }
            return points;
        }

        public static double[][] ResampleSpan(List<double[]> samples, double span, int count)
        {
            var ordered = samples.OrderBy(sample => sample[0]).ToList();
            if (ordered.Count < 2 || span <= 0) return null;
            var points = new double[count][];
            for (var index = 0; index < count; index += 1)
            {
                points[index] = SpanAt(ordered, span * index / (count - 1));
            }
            return points;
        }

        private static double[] LoopAt(List<double[]> ordered, double fraction)
        {
            var next = UpperBound(ordered, fraction);
            var after = next < ordered.Count ? ordered[next] : Shifted(ordered[0], 1);
            var before = next > 0 ? ordered[next - 1] : Shifted(ordered[ordered.Count - 1], -1);
            return Between(before, after, fraction);
        }

        private static double[] SpanAt(List<double[]> ordered, double offset)
        {
            var next = UpperBound(ordered, offset);
            if (next == 0) return new[] { ordered[0][1], ordered[0][2] };
            if (next == ordered.Count) return new[] { ordered[next - 1][1], ordered[next - 1][2] };
            return Between(ordered[next - 1], ordered[next], offset);
        }

        private static int UpperBound(List<double[]> ordered, double fraction)
        {
            int low = 0, high = ordered.Count;
            while (low < high)
            {
                var middle = (low + high) / 2;
                if (ordered[middle][0] <= fraction) low = middle + 1;
                else high = middle;
            }
            return low;
        }

        private static double[] Shifted(double[] sample, double laps)
        {
            return new[] { sample[0] + laps, sample[1], sample[2] };
        }

        private static double[] Between(double[] before, double[] after, double fraction)
        {
            var width = after[0] - before[0];
            var share = width > 0 ? (fraction - before[0]) / width : 0;
            return new[]
            {
                before[1] + (after[1] - before[1]) * share,
                before[2] + (after[2] - before[2]) * share
            };
        }
    }
}
