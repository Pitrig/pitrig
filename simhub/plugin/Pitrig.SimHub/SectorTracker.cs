using System;

namespace Pitrig.SimHub
{
    internal sealed class SectorTracker
    {
        private const double MaximumStepSeconds = 1;
        private const double FastestPlausibleShare = 0.2;
        private const int FirstSector = 1;

        private int? sector;
        private double? previous;
        private double startDelta;
        private bool boundarySeen;

        public double? Delta { get; private set; }

        public void Reset()
        {
            sector = null;
            previous = null;
            boundarySeen = false;
            Delta = null;
        }

        public void Update(int currentSector, double? liveDelta, double? bestSeconds)
        {
            if (liveDelta == null || bestSeconds == null || liveDelta < -FastestPlausibleShare * bestSeconds)
            {
                Delta = null;
                return;
            }
            var jumped = previous != null && Math.Abs(liveDelta.Value - previous.Value) > MaximumStepSeconds;
            previous = liveDelta;
            if (jumped || sector != currentSector)
            {
                boundarySeen = !jumped && sector != null;
                sector = currentSector;
                startDelta = currentSector == FirstSector ? 0 : liveDelta.Value;
            }
            Delta = boundarySeen || currentSector == FirstSector
                ? (liveDelta.Value - startDelta) * 1000
                : (double?)null;
        }
    }
}
