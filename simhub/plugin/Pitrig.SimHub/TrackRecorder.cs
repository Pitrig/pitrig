using System;
using System.Collections.Generic;
using System.Linq;

namespace Pitrig.SimHub
{
    internal sealed class TrackRecorder
    {
        private const int BinCount = 1024;
        private const int SamplesPerBin = 7;
        private const int SettledSamples = 3;
        private const double OutlierMeters = 30;
        private const double MinimumSpeedKmh = 20;
        private const int LargestPitGap = 6;
        private const int ShortestPitLane = 16;
        private const double NeighbourFraction = 0.05;

        private readonly Bin[] pit = new Bin[BinCount];
        private readonly Dictionary<string, Progress> cars = new Dictionary<string, Progress>();
        private readonly Dictionary<int, List<double>> sectorStarts = new Dictionary<int, List<double>>();

        public void Reset()
        {
            Array.Clear(pit, 0, BinCount);
            cars.Clear();
            sectorStarts.Clear();
        }

        public void Observe(string car, double fraction, double[] position, bool pitLane, bool inBox, int? sector,
            double? speedKmh)
        {
            if (double.IsNaN(fraction) || car == null) return;
            fraction = TrackOutline.Wrap(fraction);
            var moving = speedKmh == null || speedKmh >= MinimumSpeedKmh;
            if (position != null && pitLane && moving && !inBox) Add(fraction, position);
            if (cars.TryGetValue(car, out var last) && Neighbouring(last.Fraction, fraction) && sector.HasValue &&
                last.Sector.HasValue && sector == last.Sector + 1)
            {
                StartOf(sector.Value).Add(Middle(last.Fraction, fraction));
            }
            cars[car] = new Progress { Fraction = fraction, Sector = sector };
        }

        public bool PitLane(double lengthMeters, out double from, out double to, out double[][] points)
        {
            from = 0;
            to = 0;
            points = null;
            if (!LongestRun(out var first, out var length) || length < ShortestPitLane) return false;
            var samples = Samples(first, length)
                .Select(sample => new[] { TrackOutline.Wrap(sample[0] - Centre(first)), sample[1], sample[2] })
                .ToList();
            var span = (double)(length - 1) / BinCount;
            var spanMeters = double.IsNaN(lengthMeters) ? span * 5000 : span * lengthMeters;
            points = TrackOutline.ResampleSpan(samples, span, TrackOutline.PitPointCount(spanMeters));
            from = Centre(first);
            to = Centre(first + length - 1);
            return points != null;
        }

        public double[] SectorStarts(int? sectorCount)
        {
            if (sectorCount == null || sectorCount < 2) return null;
            var starts = new double[sectorCount.Value - 1];
            for (var sector = 2; sector <= sectorCount; sector += 1)
            {
                if (!sectorStarts.TryGetValue(sector, out var seen) || seen.Count == 0) return null;
                starts[sector - 2] = CircularMedian(seen);
            }
            return starts;
        }

        private List<double> StartOf(int sector)
        {
            if (!sectorStarts.TryGetValue(sector, out var list)) sectorStarts[sector] = list = new List<double>();
            return list;
        }

        private void Add(double fraction, double[] position)
        {
            var index = (int)(fraction * BinCount) % BinCount;
            var bin = pit[index] ?? (pit[index] = new Bin());
            if (bin.Count >= SettledSamples)
            {
                var settled = bin.Median();
                if (Math.Abs(settled[0] - position[0]) + Math.Abs(settled[1] - position[1]) > OutlierMeters) return;
            }
            bin.Add(position[0], position[1]);
        }

        private List<double[]> Samples(int first, int length)
        {
            var samples = new List<double[]>();
            for (var offset = 0; offset < length; offset += 1)
            {
                var index = (first + offset) % BinCount;
                if (pit[index] == null) continue;
                var median = pit[index].Median();
                samples.Add(new[] { Centre(index), median[0], median[1] });
            }
            return samples;
        }

        private bool LongestRun(out int first, out int length)
        {
            first = 0;
            length = 0;
            var start = Array.FindIndex(pit, bin => bin == null);
            if (start < 0 || pit.All(bin => bin == null)) return false;
            int runFirst = -1, gap = 0;
            for (var step = 1; step <= BinCount; step += 1)
            {
                var index = (start + step) % BinCount;
                if (pit[index] == null)
                {
                    gap += 1;
                    if (gap > LargestPitGap) runFirst = -1;
                    continue;
                }
                if (runFirst < 0) runFirst = step;
                gap = 0;
                if (step - runFirst + 1 > length)
                {
                    length = step - runFirst + 1;
                    first = (start + runFirst) % BinCount;
                }
            }
            return length > 0;
        }

        private static double Centre(int index)
        {
            return (index % BinCount + 0.5) / BinCount;
        }

        private static bool Neighbouring(double from, double to)
        {
            var distance = Math.Abs(to - from);
            return Math.Min(distance, 1 - distance) < NeighbourFraction;
        }

        private static double Middle(double from, double to)
        {
            var forward = TrackOutline.Wrap(to - from);
            return TrackOutline.Wrap(from + (forward < 0.5 ? forward : forward - 1) / 2);
        }

        private static double CircularMedian(List<double> fractions)
        {
            var reference = fractions[0];
            var unwrapped = fractions.Select(value => reference + (TrackOutline.Wrap(value - reference + 0.5) - 0.5))
                .OrderBy(value => value)
                .ToList();
            return TrackOutline.Wrap(unwrapped[unwrapped.Count / 2]);
        }

        private struct Progress
        {
            public double Fraction;
            public int? Sector;
        }

        private sealed class Bin
        {
            private readonly double[] x = new double[SamplesPerBin];
            private readonly double[] y = new double[SamplesPerBin];
            private int next;

            public int Count { get; private set; }

            public void Add(double first, double second)
            {
                x[next] = first;
                y[next] = second;
                next = (next + 1) % SamplesPerBin;
                Count = Math.Min(Count + 1, SamplesPerBin);
            }

            public double[] Median()
            {
                return new[] { MedianOf(x), MedianOf(y) };
            }

            private double MedianOf(double[] values)
            {
                var sorted = values.Take(Count).OrderBy(value => value).ToList();
                return sorted[sorted.Count / 2];
            }
        }
    }
}
