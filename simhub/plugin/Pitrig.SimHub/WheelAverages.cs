using System;
using System.Collections.Generic;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal sealed class WheelAverages
    {
        private const double SampleIntervalMs = 200;
        private const double FallbackLapSeconds = 120;

        private static readonly Func<StatusDataBase, double>[] Readings =
        {
            status => status.TyrePressureFrontLeft,
            status => status.TyrePressureFrontRight,
            status => status.TyrePressureRearLeft,
            status => status.TyrePressureRearRight,
            status => status.TyreTemperatureFrontLeft,
            status => status.TyreTemperatureFrontRight,
            status => status.TyreTemperatureRearLeft,
            status => status.TyreTemperatureRearRight,
            status => status.BrakeTemperatureFrontLeft,
            status => status.BrakeTemperatureFrontRight,
            status => status.BrakeTemperatureRearLeft,
            status => status.BrakeTemperatureRearRight
        };

        private static readonly Dictionary<FieldComputation, int> Channels = new Dictionary<FieldComputation, int>
        {
            { FieldComputation.TyrePressureAverageFrontLeft, 0 },
            { FieldComputation.TyrePressureAverageFrontRight, 1 },
            { FieldComputation.TyrePressureAverageRearLeft, 2 },
            { FieldComputation.TyrePressureAverageRearRight, 3 },
            { FieldComputation.TyreTemperatureAverageFrontLeft, 4 },
            { FieldComputation.TyreTemperatureAverageFrontRight, 5 },
            { FieldComputation.TyreTemperatureAverageRearLeft, 6 },
            { FieldComputation.TyreTemperatureAverageRearRight, 7 },
            { FieldComputation.BrakeTemperatureAverageFrontLeft, 8 },
            { FieldComputation.BrakeTemperatureAverageFrontRight, 9 },
            { FieldComputation.BrakeTemperatureAverageRearLeft, 10 },
            { FieldComputation.BrakeTemperatureAverageRearRight, 11 }
        };

        private readonly Queue<KeyValuePair<double, double>>[] samples =
            new Queue<KeyValuePair<double, double>>[Readings.Length];
        private readonly double[] sums = new double[Readings.Length];
        private double nextSample;

        public WheelAverages()
        {
            for (var channel = 0; channel < samples.Length; channel += 1)
            {
                samples[channel] = new Queue<KeyValuePair<double, double>>();
            }
        }

        public static bool Covers(FieldComputation computation)
        {
            return Channels.ContainsKey(computation);
        }

        public double? Mean(FieldComputation computation)
        {
            var channel = Channels[computation];
            var count = samples[channel].Count;
            return count == 0 ? (double?)null : sums[channel] / count;
        }

        public void Reset()
        {
            for (var channel = 0; channel < samples.Length; channel += 1)
            {
                samples[channel].Clear();
                sums[channel] = 0;
            }
            nextSample = 0;
        }

        public void Sample(StatusDataBase status, double now, double laps, bool driving)
        {
            if (now < nextSample) return;
            nextSample = now + SampleIntervalMs;
            var span = laps * (TimingComputations.LapSeconds(status) ?? FallbackLapSeconds) * 1000;
            for (var channel = 0; channel < Readings.Length; channel += 1)
            {
                var queue = samples[channel];
                var value = Readings[channel](status);
                if (driving && value > 0)
                {
                    queue.Enqueue(new KeyValuePair<double, double>(now, value));
                    sums[channel] += value;
                }
                while (queue.Count > 0 && now - queue.Peek().Key > span) sums[channel] -= queue.Dequeue().Value;
            }
        }
    }
}
