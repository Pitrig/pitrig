using System;
using System.Linq;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class TelemetryState
    {
        private string session;
        private int completedLaps;
        private TimeSpan lastLap;
        private bool lapTouchedPit;

        public PluginManager Manager { get; private set; }

        public string GameName { get; private set; }

        public StatusDataBase Status { get; private set; }

        public Opponent Player { get; private set; }

        public double FuelMargin { get; private set; }

        public bool CheckeredShown { get; private set; }

        public double? CleanLapSeconds { get; private set; }

        public SectorTracker Sectors { get; } = new SectorTracker();

        public LapValidity Validity { get; } = new LapValidity();

        public WheelAverages Averages { get; } = new WheelAverages();

        public ShiftLights Shifts { get; } = new ShiftLights();

        public InputState Inputs { get; } = new InputState();

        public void Reset()
        {
            session = null;
            completedLaps = 0;
            CheckeredShown = false;
            CleanLapSeconds = null;
            Sectors.Reset();
        }

        public void Update(PluginManager manager, GameData data, PluginSettings settings, double now)
        {
            Manager = manager;
            GameName = data?.GameName;
            Status = data?.GameRunning == true ? data.NewData : null;
            Player = Status?.Opponents?.FirstOrDefault(opponent => opponent.IsPlayer);
            FuelMargin = settings.FuelMargin;
            Shifts.Update(manager, Status, data?.GameName);
            Averages.Sample(this, data, now, settings.AverageLaps);
            if (Status == null) return;
            if (NewSession())
            {
                CheckeredShown = false;
                CleanLapSeconds = null;
                lastLap = Status.LastLapTime;
                lapTouchedPit = true;
                Sectors.Reset();
            }
            if (Status.Flag_Checkered > 0) CheckeredShown = true;
            Validity.Update(this);
            var inPit = Status.IsInPitLane > 0 || Status.IsInPit > 0;
            TrackCleanLap(inPit);
            Sectors.Update(Status.CurrentSectorIndex, TimingComputations.LiveDeltaSeconds(this),
                Computed.Seconds(Status.BestLapTime));
        }

        private void TrackCleanLap(bool inPit)
        {
            if (inPit) lapTouchedPit = true;
            if (Status.LastLapTime == lastLap) return;
            if (!lapTouchedPit) CleanLapSeconds = Computed.Seconds(Status.LastLapTime) ?? CleanLapSeconds;
            lastLap = Status.LastLapTime;
            lapTouchedPit = inPit;
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
