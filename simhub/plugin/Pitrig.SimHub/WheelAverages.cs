using System;
using System.Collections.Generic;
using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal sealed class WheelAverages
    {
        private const double SampleIntervalMs = 3000;
        private const double SecondsPerSample = 3;
        private const int FallbackSamplesPerLap = 349;
        private const int FallbackLaps = 2;

        private static readonly Func<TelemetryState, double?>[] Readings =
        {
            state => Kilopascals(state.Status.TyrePressureFrontLeft, state.Status),
            state => Kilopascals(state.Status.TyrePressureFrontRight, state.Status),
            state => Kilopascals(state.Status.TyrePressureRearLeft, state.Status),
            state => Kilopascals(state.Status.TyrePressureRearRight, state.Status),
            state => TyreTemperatures.Reading(state, 0),
            state => TyreTemperatures.Reading(state, 1),
            state => TyreTemperatures.Reading(state, 2),
            state => TyreTemperatures.Reading(state, 3),
            state => state.Status.BrakeTemperatureFrontLeft,
            state => state.Status.BrakeTemperatureFrontRight,
            state => state.Status.BrakeTemperatureRearLeft,
            state => state.Status.BrakeTemperatureRearRight
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

        private readonly List<double>[] samples = new List<double>[Readings.Length];
        private readonly double?[] means = new double?[Readings.Length];
        private double lastTick;

        public WheelAverages()
        {
            for (var channel = 0; channel < samples.Length; channel += 1) samples[channel] = new List<double>();
        }

        public static bool Covers(FieldComputation computation)
        {
            return Channels.ContainsKey(computation);
        }

        public double? Mean(FieldComputation computation)
        {
            return means[Channels[computation]];
        }

        public void Sample(TelemetryState state, GameData data, double now, int laps)
        {
            if (now - lastTick < SampleIntervalMs) return;
            lastTick = now;
            if (!OnTrack(data)) return;
            var maximum = SamplesPerLap(state.Status) * (laps > 0 ? laps : FallbackLaps);
            for (var channel = 0; channel < Readings.Length; channel += 1)
            {
                var value = Readings[channel](state);
                if (value == null) continue;
                var list = samples[channel];
                list.Add(value.Value);
                if (list.Count > maximum) list.RemoveRange(0, list.Count - maximum);
                means[channel] = list.Average();
            }
        }

        private static bool OnTrack(GameData data)
        {
            return data != null && data.GameRunning && data.NewData != null && !data.GameInMenu && !data.GamePaused &&
                   data.NewData.IsInPitLane == 0 && data.NewData.IsInPit == 0;
        }

        private static int SamplesPerLap(StatusDataBase status)
        {
            if (status.BestLapTime.TotalSeconds > 0) return (int)Math.Ceiling(status.BestLapTime.TotalSeconds / SecondsPerSample);
            if (status.LastLapTime.TotalSeconds > 0) return (int)Math.Ceiling(status.LastLapTime.TotalSeconds / SecondsPerSample);
            return FallbackSamplesPerLap;
        }

        private static double? Kilopascals(double pressure, StatusDataBase status)
        {
            return FieldReader.Localized(pressure, status.TyrePressureUnit, TelemetryCatalog.KilopascalUnits);
        }
    }
}
