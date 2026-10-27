using System;
using System.Collections.Generic;
using System.Globalization;

namespace Pitrig.SimHub
{
    internal sealed class TraceSubject
    {
        private const double WindowMs = 60000;
        private const double PauseMs = 500;
        private const string SessionStart = nameof(BoardState.Connecting);

        private readonly object gate = new object();
        private readonly RollingPeak longestWrite = new RollingPeak();
        private readonly RollingPeak longestGap = new RollingPeak();
        private readonly RollingPeak slowestUpdate = new RollingPeak();
        private string state = string.Empty;
        private double stateSince;
        private double windowStart;
        private double lastTick = double.NaN;
        private double lastPauseAt;
        private double lastPauseMs;
        private int sessions;
        private int busyRetries;
        private int pauses;
        private long writes;
        private long bytes;
        private long updates;

        public void Enter(string next, double now)
        {
            lock (gate)
            {
                if (next == SessionStart) sessions += 1;
                state = next;
                stateSince = now;
            }
        }

        public void Requested(int busy)
        {
            lock (gate) busyRetries += busy;
        }

        public void Wrote(int count, double milliseconds, double now)
        {
            lock (gate)
            {
                Roll(now);
                writes += 1;
                bytes += count;
                longestWrite.Add(milliseconds);
                if (milliseconds >= PauseMs) Paused(milliseconds, now);
            }
        }

        public double Updated(double tick, double costMicroseconds, double now)
        {
            lock (gate)
            {
                Roll(now);
                var gap = double.IsNaN(lastTick) ? 0 : tick - lastTick;
                lastTick = tick;
                updates += 1;
                longestGap.Add(gap);
                slowestUpdate.Add(costMicroseconds / 1000);
                if (gap >= PauseMs) Paused(gap, now);
                return gap;
            }
        }

        public string Describe(string name, double now)
        {
            lock (gate)
            {
                Roll(now);
                var parts = new List<string>();
                if (state.Length > 0) parts.Add(Text("{0} for {1:0} s, session {2}", state, (now - stateSince) / 1000, sessions));
                if (writes > 0) parts.Add(Text("{0} writes, {1:0} KB, longest write {2:0.0} ms", writes, bytes / 1024.0, longestWrite.Value));
                if (updates > 0) parts.Add(Text("longest gap {0:0} ms, slowest update {1:0.00} ms", longestGap.Value, slowestUpdate.Value));
                if (busyRetries > 0) parts.Add(Text("{0} busy answers repeated", busyRetries));
                parts.Add(pauses == 0
                    ? "no pause over 0.5 s"
                    : Text("{0} pauses over 0.5 s, the last {1:0} ms, {2:0} s ago", pauses, lastPauseMs, (now - lastPauseAt) / 1000));
                return name + ": " + string.Join("; ", parts) + ".";
            }
        }

        private void Paused(double milliseconds, double now)
        {
            pauses += 1;
            lastPauseMs = milliseconds;
            lastPauseAt = now;
        }

        private void Roll(double now)
        {
            if (now - windowStart < WindowMs) return;
            windowStart = now;
            longestWrite.Roll();
            longestGap.Roll();
            slowestUpdate.Roll();
        }

        private static string Text(string format, params object[] arguments)
        {
            return string.Format(CultureInfo.InvariantCulture, format, arguments);
        }
    }

    internal sealed class RollingPeak
    {
        private double current;
        private double previous;

        public double Value => Math.Max(current, previous);

        public void Add(double value)
        {
            if (value > current) current = value;
        }

        public void Roll()
        {
            previous = current;
            current = 0;
        }
    }
}
