using System.Linq;
using GameReaderCommon;

namespace Pitrig.SimHub
{
    internal static class SectorComputations
    {
        private const string Lmu = "LMU";
        private const string Scoring = "DataCorePlugin.GameRawData.PlayerNativeScoring.";
        private const double FinishedLapHoldMs = 5000;
        private const int LastSector = 3;

        public static double? Running(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            var current = status.CurrentSectorIndex;
            if (current < 1 || current > LastSector) return null;
            double? elapsed = status.CurrentLapTime.TotalSeconds;
            for (var sector = 1; sector < current; sector += 1) elapsed -= Current(state, sector);
            return Milliseconds(elapsed);
        }

        public static double? Box(TelemetryState state, int sector)
        {
            var status = state.Status;
            if (status == null) return null;
            if (HoldingFinishedLap(state)) return Milliseconds(Last(state, sector));
            var current = status.CurrentSectorIndex;
            if (sector < current) return Milliseconds(Current(state, sector));
            return sector == current ? Running(state) : Milliseconds(Last(state, sector));
        }

        public static double? BestTime(TelemetryState state, int sector)
        {
            return state.Status == null ? null : Milliseconds(Best(state, sector));
        }

        public static double? OptimalTime(TelemetryState state)
        {
            if (state.Status == null) return null;
            double total = 0;
            for (var sector = 1; sector <= 3; sector++)
            {
                var best = Best(state, sector);
                if (best == null) return null;
                total += best.Value;
            }
            return Milliseconds(total);
        }

        public static int? Status(TelemetryState state, int sector)
        {
            var status = state.Status;
            if (status == null) return null;
            if (HoldingFinishedLap(state)) return Grade(state, sector, Last(state, sector), state.Validity.LastLapInvalid);
            if (sector >= status.CurrentSectorIndex) return TimingComputations.StatusNone;
            return Grade(state, sector, Current(state, sector), state.Validity.Invalid(state));
        }

        private static bool HoldingFinishedLap(TelemetryState state)
        {
            return state.Now - state.LapCompletedAt < FinishedLapHoldMs;
        }

        private static int? Grade(TelemetryState state, int sector, double? seconds, bool? invalid)
        {
            return TimingComputations.Grade(seconds, Best(state, sector), OverallSplit(state.Status, sector), invalid);
        }

        private static double? Current(TelemetryState state, int sector)
        {
            if (sector >= LastSector) return null;
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

        private static double? OverallSplit(StatusDataBase status, int sector)
        {
            var split = status.BestSessionSplits?.FirstOrDefault(entry => entry.SectorIndex == sector);
            return split == null ? null : Computed.Seconds(split.SplitTime);
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
