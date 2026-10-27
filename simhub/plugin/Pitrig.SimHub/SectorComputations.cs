using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class SectorComputations
    {
        private const string Lmu = "LMU";
        private const string Scoring = "DataCorePlugin.GameRawData.PlayerNativeScoring.";
        private const double ReviewMilliseconds = 5000;
        private const int ReviewAfterLaps = 1;
        private const int LastSector = 3;

        public static double? Running(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var lap = status.CurrentLapTime.TotalSeconds;
            switch (status.CurrentSectorIndex)
            {
                case 1:
                    return Milliseconds(lap);
                case 2:
                    return Milliseconds(lap - (Current(state, 1) ?? 0));
                case 3:
                    return Milliseconds(lap - (Current(state, 1) ?? 0) - (Current(state, 2) ?? 0));
                default:
                    return null;
            }
        }

        public static double? Box(TelemetryState state, int sector)
        {
            var status = state.Status;
            if (status == null) return null;
            if (Reviewing(status)) return Milliseconds(Last(state, sector));
            var current = status.CurrentSectorIndex;
            switch (sector)
            {
                case 1:
                    return current == 1 ? Running(state) : Milliseconds(Current(state, 1));
                case 2:
                    if (current == 1) return Milliseconds(Last(state, 2));
                    return current == 2 ? Running(state) : Milliseconds(Current(state, 2));
                default:
                    return current < LastSector ? Milliseconds(Last(state, LastSector)) : Running(state);
            }
        }

        public static double? BestTime(TelemetryState state, int sector)
        {
            return state.Status == null ? null : Milliseconds(Best(state, sector));
        }

        public static int? Status(TelemetryState state, int sector)
        {
            var status = state.Status;
            if (status == null) return null;
            var current = status.CurrentSectorIndex;
            if (current <= 0) return TimingComputations.StatusNone;
            var best = Best(state, sector) ?? 0;
            var split = OverallSplit(status, sector);
            if (Reviewing(status))
            {
                var last = Last(state, sector) ?? 0;
                if (last - split == 0) return TimingComputations.StatusSessionBest;
                return last - best <= 0 ? TimingComputations.StatusPersonalBest : TimingComputations.StatusSlower;
            }
            if (sector >= current) return TimingComputations.StatusNone;
            var time = Current(state, sector) ?? 0;
            if (time - split <= 0) return TimingComputations.StatusSessionBest;
            return time - best <= 0 ? TimingComputations.StatusPersonalBest : TimingComputations.StatusSlower;
        }

        private static bool Reviewing(StatusDataBase status)
        {
            var lap = status.CurrentLapTime.TotalMilliseconds;
            return status.CompletedLaps > ReviewAfterLaps && lap < ReviewMilliseconds && lap != 0;
        }

        private static double? Current(TelemetryState state, int sector)
        {
            if (state.GameName == Lmu)
            {
                return sector == 1
                    ? Positive(Scored(state, "mCurSector1"))
                    : Positive(Scored(state, "mCurSector2") - Scored(state, "mCurSector1"));
            }
            return Computed.Seconds(sector == 1 ? state.Status.Sector1Time : state.Status.Sector2Time);
        }

        private static double? Last(TelemetryState state, int sector)
        {
            if (state.GameName == Lmu)
            {
                switch (sector)
                {
                    case 1:
                        return Positive(Scored(state, "mLastSector1"));
                    case 2:
                        return Positive(Scored(state, "mLastSector2") - Scored(state, "mLastSector1"));
                    default:
                        return Positive(Scored(state, "mLastLapTime") - Scored(state, "mLastSector2"));
                }
            }
            var status = state.Status;
            switch (sector)
            {
                case 1:
                    return Computed.Seconds(status.Sector1LastLapTime);
                case 2:
                    return Computed.Seconds(status.Sector2LastLapTime);
                default:
                    return Computed.Seconds(status.Sector3LastLapTime);
            }
        }

        private static double? Best(TelemetryState state, int sector)
        {
            if (state.GameName == Lmu)
            {
                switch (sector)
                {
                    case 1:
                        return Positive(Scored(state, "mBestSector1"));
                    case 2:
                        return Positive(Scored(state, "mBestSector2") - Scored(state, "mBestSector1"));
                    default:
                        return Positive(Scored(state, "mBestLapTime") - Scored(state, "mBestSector2"));
                }
            }
            var status = state.Status;
            switch (sector)
            {
                case 1:
                    return Computed.Seconds(status.Sector1BestTime);
                case 2:
                    return Computed.Seconds(status.Sector2BestTime);
                default:
                    return Computed.Seconds(status.Sector3BestTime);
            }
        }

        private static double OverallSplit(StatusDataBase status, int sector)
        {
            var split = status.BestSessionSplits?.FirstOrDefault(entry => entry.SectorIndex == sector);
            return split == null ? 0 : split.SplitTime.TotalSeconds;
        }

        private static double? Scored(TelemetryState state, string name)
        {
            return Computed.Number(state.Manager.GetPropertyValue(Scoring + name));
        }

        private static double? Positive(double? seconds)
        {
            return seconds > 0 ? seconds : null;
        }

        private static double? Milliseconds(double? seconds)
        {
            return seconds * 1000;
        }
    }
}
