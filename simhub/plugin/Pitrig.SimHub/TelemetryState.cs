using System;
using System.Linq;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class TelemetryState
    {
        private const double MinimumSampleSpeedKmh = 5;

        private string session;
        private int completedLaps;
        private bool wasInPit;

        public PluginManager Manager { get; private set; }

        public StatusDataBase Status { get; private set; }

        public Opponent Player { get; private set; }

        public double ReserveLaps { get; private set; }

        public bool CheckeredShown { get; private set; }

        public SectorTracker Sectors { get; } = new SectorTracker();

        public WheelAverages Averages { get; } = new WheelAverages();

        public ShiftLights Shifts { get; } = new ShiftLights();

        public void Reset()
        {
            session = null;
            completedLaps = 0;
            wasInPit = false;
            CheckeredShown = false;
            Sectors.Reset();
            Averages.Reset();
        }

        public void Update(PluginManager manager, GameData data, PluginSettings settings, double now)
        {
            Manager = manager;
            Status = data?.GameRunning == true ? data.NewData : null;
            Player = Status?.Opponents?.FirstOrDefault(opponent => opponent.IsPlayer);
            ReserveLaps = Math.Max(settings.FuelReserveLaps, 0);
            Shifts.Update(manager, Status, data?.GameName);
            if (Status == null) return;
            if (NewSession())
            {
                CheckeredShown = false;
                Sectors.Reset();
                Averages.Reset();
            }
            if (Status.Flag_Checkered > 0) CheckeredShown = true;
            var inPit = Status.IsInPitLane > 0 || Status.IsInPit > 0;
            if (wasInPit && !inPit) Averages.Reset();
            wasInPit = inPit;
            var driving = !data.GamePaused && !Status.IsGameReplay && !inPit && Status.SpeedKmh > MinimumSampleSpeedKmh;
            Averages.Sample(Status, now, Math.Max(settings.AverageLaps, 1), driving);
            Sectors.Update(Status.CurrentSectorIndex, TimingComputations.LiveDeltaSeconds(this));
        }

        private bool NewSession()
        {
            var identity = Status.CarId + "|" + Status.TrackId + "|" + Status.SessionTypeName;
            var restarted = identity != session || Status.CompletedLaps < completedLaps;
            session = identity;
            completedLaps = Status.CompletedLaps;
            return restarted;
        }
    }
}
