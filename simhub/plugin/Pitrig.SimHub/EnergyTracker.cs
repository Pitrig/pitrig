using System.Collections.Generic;
using System.Linq;

namespace Pitrig.SimHub
{
    internal sealed class EnergyTracker
    {
        private const string Lmu = "LMU";
        private const string VirtualEnergy = "DataCorePlugin.GameRawData.PlayerNativeTelemetry.mVirtualEnergy";
        private const int Window = 3;

        private readonly Queue<double> perLap = new Queue<double>();
        private double? lapStart;
        private bool lapTouchedPit;

        public void Reset()
        {
            perLap.Clear();
            lapStart = null;
            lapTouchedPit = true;
        }

        public void Update(TelemetryState state, bool lapCompleted, bool inPit)
        {
            if (state.GameName != Lmu) return;
            var energy = Read(state);
            if (inPit) lapTouchedPit = true;
            if (!lapCompleted)
            {
                if (lapStart == null) lapStart = energy;
                return;
            }
            var used = lapStart - energy;
            if (used > 0 && !lapTouchedPit)
            {
                perLap.Enqueue(used.Value);
                while (perLap.Count > Window) perLap.Dequeue();
            }
            lapStart = energy;
            lapTouchedPit = inPit;
        }

        public double? LapsRemaining(TelemetryState state)
        {
            if (state.GameName != Lmu || perLap.Count == 0) return null;
            var average = perLap.Average();
            return average > 0 ? Read(state) / average : null;
        }

        private static double? Read(TelemetryState state)
        {
            return Computed.Number(state.Manager?.GetPropertyValue(VirtualEnergy));
        }
    }
}
