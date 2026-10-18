using System;
using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class TimingComputations
    {
        private const double MaximumLapGain = 0.2;
        private const int LastTimedSector = 3;
        private const int StatusNone = 0;
        private const int StatusSlower = 1;
        private const int StatusPersonalBest = 2;
        private const int StatusSessionBest = 3;
        private const int StatusInvalid = 4;
        private const string SessionBestLiveDelta = "PersistantTrackerPlugin.SessionBestLiveDeltaSeconds";
        private const string AllTimeBestLiveDelta = "PersistantTrackerPlugin.AllTimeBestLiveDeltaSeconds";

        public static double? LiveDelta(TelemetryState state)
        {
            return Computed.Number(state.Manager.GetPropertyValue(SessionBestLiveDelta)) * 1000;
        }

        public static double? AllTimeLiveDelta(TelemetryState state)
        {
            return Computed.Number(state.Manager.GetPropertyValue(AllTimeBestLiveDelta)) * 1000;
        }

        public static double? LiveDeltaSeconds(TelemetryState state)
        {
            var delta = Computed.Number(state.Manager.GetPropertyValue(SessionBestLiveDelta));
            return delta >= -BestSeconds(state.Status) * MaximumLapGain ? delta : null;
        }

        public static double? EstimatedLapTime(TelemetryState state)
        {
            return EstimatedSeconds(state) * 1000;
        }

        public static TimeSpan? SessionBestLap(StatusDataBase status)
        {
            var best = status?.BestLapSameClassOpponent?.BestLapTime;
            return best > TimeSpan.Zero ? best : null;
        }

        public static double? SessionBestDelta(TelemetryState state)
        {
            return (EstimatedSeconds(state) - Computed.Seconds(SessionBestLap(state.Status))) * 1000;
        }

        public static double? LastLapDeltaBest(StatusDataBase status)
        {
            if (status == null) return null;
            var lap = LastLap(status);
            if (lap == null)
            {
                return (Computed.Seconds(status.LastLapTime) - Computed.Seconds(status.BestLapTime)) * 1000;
            }
            if (lap.PreviousBestLaptime <= TimeSpan.Zero) return null;
            return (lap.Laptime - lap.PreviousBestLaptime).TotalMilliseconds;
        }

        public static int? DeltaStatus(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var estimate = EstimatedSeconds(state);
            if (estimate == null) return StatusNone;
            if (status.LapInvalidated) return StatusInvalid;
            return Grade(estimate.Value, BestSeconds(status), Computed.Seconds(SessionBestLap(status)));
        }

        public static int? LastLapStatus(StatusDataBase status)
        {
            if (status == null) return null;
            var last = Computed.Seconds(status.LastLapTime);
            if (last == null) return StatusNone;
            if (LastLap(status)?.IsValid == false) return StatusInvalid;
            return Grade(last.Value, BestSeconds(status), Computed.Seconds(SessionBestLap(status)));
        }

        public static int? SectorStatus(StatusDataBase status, int sector)
        {
            if (status == null) return null;
            var time = Computed.Seconds(SectorTimeOf(status, sector));
            if (time == null) return StatusNone;
            if (sector < LastTimedSector && status.LapInvalidated) return StatusInvalid;
            return Grade(time.Value, Computed.Seconds(PersonalBestSector(status, sector)),
                Computed.Seconds(ClassBestSector(status, sector)));
        }

        public static double? SectorTime(StatusDataBase status)
        {
            if (status == null) return null;
            var elapsed = status.CurrentLapTime;
            switch (status.CurrentSectorIndex)
            {
                case 1:
                    return elapsed.TotalMilliseconds;
                case 2:
                    return (elapsed - Completed(status.Sector1Time))?.TotalMilliseconds;
                case 3:
                    return (elapsed - Completed(status.Sector1Time) - Completed(status.Sector2Time))?.TotalMilliseconds;
                default:
                    return null;
            }
        }

        public static double? LapsRemaining(StatusDataBase status)
        {
            if (status == null) return null;
            if (status.TotalLaps > 0) return status.TotalLaps - status.CompletedLaps;
            var lap = LapSeconds(status);
            if (lap == null) return null;
            var left = status.SessionTimeLeft.TotalSeconds;
            if (left <= 0) return 1;
            var toLine = Math.Max(lap.Value - status.CurrentLapTime.TotalSeconds, 0);
            return 1 + Math.Ceiling(Math.Max(left - toLine, 0) / lap.Value);
        }

        public static bool? TimedSession(StatusDataBase status)
        {
            if (status == null) return null;
            return !(status.TotalLaps > 0) && status.SessionTimeLeft > TimeSpan.Zero;
        }

        public static double? LapSeconds(StatusDataBase status)
        {
            return BestSeconds(status) ?? Computed.Seconds(status?.LastLapTime);
        }

        private static double? BestSeconds(StatusDataBase status)
        {
            return Computed.Seconds(status?.BestLapTime);
        }

        private static double? EstimatedSeconds(TelemetryState state)
        {
            return BestSeconds(state.Status) + LiveDeltaSeconds(state);
        }

        private static int Grade(double time, double? personalBest, double? sessionBest)
        {
            if (time <= sessionBest) return StatusSessionBest;
            if (time <= personalBest) return StatusPersonalBest;
            return StatusSlower;
        }

        private static LapHistoryEntry LastLap(StatusDataBase status)
        {
            var lap = status.SessionLapHistory?.LastOrDefault();
            return lap != null && lap.Laptime > TimeSpan.Zero && lap.Laptime == status.LastLapTime ? lap : null;
        }

        private static TimeSpan? Completed(TimeSpan? sector)
        {
            return sector > TimeSpan.Zero ? sector : null;
        }

        private static TimeSpan? SectorTimeOf(StatusDataBase status, int sector)
        {
            switch (sector)
            {
                case 1:
                    return status.Sector1Time;
                case 2:
                    return status.Sector2Time;
                default:
                    return status.Sector3LastLapTime;
            }
        }

        private static TimeSpan? PersonalBestSector(StatusDataBase status, int sector)
        {
            switch (sector)
            {
                case 1:
                    return status.Sector1BestTime;
                case 2:
                    return status.Sector2BestTime;
                default:
                    return status.Sector3BestTime;
            }
        }

        private static TimeSpan? ClassBestSector(StatusDataBase status, int sector)
        {
            return status.BestSessionSplitsPlayerClass?.FirstOrDefault(split => split.SectorIndex == sector)?.SplitTime;
        }
    }
}
