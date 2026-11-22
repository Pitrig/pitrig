using System.Linq;
using System.Threading.Tasks;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal sealed class TrackMaps
    {
        private const double RefineIntervalMs = 5000;
        private const double LookupIntervalMs = 20000;
        private const double LongerPitLane = 1.1;
        private const string PlayerKey = "player";

        private readonly TrackRecorder recorder = new TrackRecorder();
        private TrackIdentity track;
        private TrackOutline outline;
        private PitLane pit;
        private string[] pieces = TrackOutlineEncoder.Pieces(null);
        private int cursor;
        private Task<Found> lookup;
        private double lookedAt = double.NegativeInfinity;
        private double refinedAt = double.NegativeInfinity;
        private double carsAt = double.NaN;
        private string[] cars = new string[TrackCars.FieldCount];

        public static bool Covers(FieldComputation computation)
        {
            switch (computation)
            {
                case FieldComputation.TrackMapOutline:
                case FieldComputation.TrackMapCars1:
                case FieldComputation.TrackMapCars2:
                case FieldComputation.TrackMapCars3:
                case FieldComputation.TrackMapCars4:
                    return true;
                default:
                    return false;
            }
        }

        public object Value(TelemetryState state, FieldComputation computation)
        {
            if (state.Status == null || track == null) return null;
            if (computation != FieldComputation.TrackMapOutline) return CarField(state, computation);
            cursor = (cursor + 1) % pieces.Length;
            return pieces[cursor];
        }

        public void Update(TelemetryState state)
        {
            var current = TrackIdentity.Of(state.GameName, state.Status);
            if (current == null) return;
            if (track == null || current.Key != track.Key) Switch(current, state.Now);
            Adopt();
            Observe(state.Status);
            if (state.Now - refinedAt < RefineIntervalMs) return;
            refinedAt = state.Now;
            Refine(state);
        }

        private void Switch(TrackIdentity next, double now)
        {
            track = next;
            pit = null;
            recorder.Reset();
            Publish(null);
            Look(now);
        }

        private void Look(double now)
        {
            lookedAt = now;
            var wanted = track;
            lookup = Task.Run(() => new Found
            {
                Track = wanted,
                Outline = SimHubMapRecords.Find(wanted.Game, wanted),
                Pit = PitLaneStore.Load(wanted)
            });
        }

        private void Adopt()
        {
            if (lookup == null || !lookup.IsCompleted) return;
            var found = lookup.Status == TaskStatus.RanToCompletion ? lookup.Result : null;
            lookup = null;
            if (found == null || found.Track.Key != track.Key) return;
            if (pit == null) pit = found.Pit;
            if (found.Outline == null) return;
            found.Outline.Pit = pit;
            Publish(found.Outline);
        }

        private void Observe(StatusDataBase status)
        {
            foreach (var car in status.Opponents ?? Enumerable.Empty<Opponent>())
            {
                if (car.IsPlayer || !car.IsConnected || !car.TrackPositionPercent.HasValue) continue;
                recorder.Observe(car.Id, car.TrackPositionPercent.Value, Position(car.Coordinates),
                    car.IsCarInPitLane, car.IsCarInPit, car.CurrentSector, car.Speed);
            }
            recorder.Observe(PlayerKey, status.TrackPositionPercent, Position(status.CarCoordinates),
                status.IsInPitLane > 0, status.IsInPit > 0, status.CurrentSectorIndex, status.SpeedKmh);
        }

        private double[] Position(double[] world)
        {
            return world != null && world.Length >= 3 ? track.MapPoint(world[0], world[2]) : null;
        }

        private void Refine(TelemetryState state)
        {
            if (lookup != null) return;
            var pitLearned = LearnPitLane();
            if (outline == null)
            {
                if (state.Now - lookedAt >= LookupIntervalMs) Look(state.Now);
                return;
            }
            var sectors = outline.Sectors == null || outline.Sectors.Length == 0
                ? recorder.SectorStarts(state.Status.SectorsCount)
                : null;
            if (!pitLearned && sectors == null) return;
            var next = outline.Copy();
            next.Pit = pit;
            if (sectors != null) next.Sectors = sectors;
            Publish(next);
        }

        private bool LearnPitLane()
        {
            if (!recorder.PitLane(track.LengthMeters ?? double.NaN, out var from, out var to, out var points)) return false;
            if (pit != null && TrackOutline.Wrap(to - from) <= pit.Span * LongerPitLane) return false;
            pit = new PitLane { From = from, To = to, Points = points };
            var saved = track;
            var learned = pit;
            Task.Run(() => PitLaneStore.Save(saved, learned));
            return true;
        }

        private void Publish(TrackOutline next)
        {
            outline = next;
            pieces = TrackOutlineEncoder.Pieces(next);
            cursor = 0;
        }

        private string CarField(TelemetryState state, FieldComputation computation)
        {
            if (!state.Now.Equals(carsAt))
            {
                cars = TrackCars.Fields(state);
                carsAt = state.Now;
            }
            switch (computation)
            {
                case FieldComputation.TrackMapCars1:
                    return cars[0];
                case FieldComputation.TrackMapCars2:
                    return cars[1];
                case FieldComputation.TrackMapCars3:
                    return cars[2];
                default:
                    return cars[3];
            }
        }

        private sealed class Found
        {
            public TrackIdentity Track;
            public TrackOutline Outline;
            public PitLane Pit;
        }
    }
}
