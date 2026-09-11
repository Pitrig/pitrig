using System;

namespace Pitrig.SimHub
{
    internal sealed class SectorTracker
    {
        private const double MaximumStepSeconds = 1;

        private double? sector;
        private double? previous;
        private double startDelta;
        private bool boundarySeen;

        public void Reset()
        {
            sector = null;
            previous = null;
            boundarySeen = false;
        }

        public double? Delta(double? currentSector, double? liveDelta)
        {
            if (currentSector == null || liveDelta == null) return null;
            var jumped = previous != null && Math.Abs(liveDelta.Value - previous.Value) > MaximumStepSeconds;
            previous = liveDelta;
            if (jumped || sector != currentSector)
            {
                boundarySeen = !jumped && sector != null;
                sector = currentSector;
                startDelta = liveDelta.Value;
            }
            return boundarySeen ? (liveDelta.Value - startDelta) * 1000 : (double?)null;
        }
    }
}
