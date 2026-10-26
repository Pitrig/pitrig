using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading;

namespace Pitrig.SimHub
{
    internal sealed class BoardManager
    {
        private const int TickMs = 250;
        private const int StartDelayMs = 2000;
        private const int ScanIntervalMs = 1000;
        private const int BusyRetryMs = 3000;
        private const int LostRetryMs = 1000;
        private const int StopTimeoutMs = 3000;
        private const int NativeBaudRate = 921600;

        private readonly FieldValues values;
        private readonly ConfiguratorLink link;
        private readonly Stopwatch clock;
        private readonly AutoResetEvent nudge = new AutoResetEvent(false);
        private readonly object gate = new object();
        private readonly List<BoardSession> sessions = new List<BoardSession>();
        private readonly Dictionary<string, double> retryAt = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, int[]> handedFields = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, int[]> lastFields = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, ByteRate> samples = new Dictionary<string, ByteRate>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> silent = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> busy = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private HashSet<string> present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private Dictionary<string, PortKind> kinds = new Dictionary<string, PortKind>(StringComparer.OrdinalIgnoreCase);
        private Func<List<KnownPort>> knownPorts;
        private Action<KnownPort> remember;
        private Thread thread;
        private volatile bool running;
        private double startAt;
        private double nextScan;

        public BoardManager(FieldValues values, ConfiguratorLink link, Stopwatch clock)
        {
            this.values = values;
            this.link = link;
            this.clock = clock;
        }

        public void Start(Func<List<KnownPort>> known, Action<KnownPort> learn)
        {
            knownPorts = known;
            remember = learn;
            if (running) return;
            running = true;
            startAt = clock.Elapsed.TotalMilliseconds + StartDelayMs;
            thread = new Thread(Run) { IsBackground = true, Name = "Pitrig boards" };
            thread.Start();
        }

        public void Stop()
        {
            running = false;
            nudge.Set();
            thread?.Join(StopTimeoutMs);
            thread = null;
            List<BoardSession> stopped;
            lock (gate)
            {
                stopped = sessions.ToList();
                sessions.Clear();
            }
            foreach (var session in stopped) session.Stop();
        }

        public void Nudge()
        {
            nudge.Set();
        }

        public void WakeAll()
        {
            lock (gate)
            {
                foreach (var session in sessions) session.Wake();
            }
        }

        public void CollectWanted(bool[] wanted)
        {
            lock (gate)
            {
                foreach (var session in sessions)
                {
                    foreach (var index in session.Fields) wanted[index] = true;
                }
            }
        }

        public List<BoardStatus> Describe()
        {
            lock (gate)
            {
                return sessions.Select(session => new BoardStatus
                {
                    Port = session.PortName,
                    Board = session.Board,
                    Firmware = session.Firmware,
                    State = session.State,
                    Fields = session.Fields.Length,
                    BytesPerSecond = samples.TryGetValue(session.PortName, out var sample) ? sample.Rate : 0
                }).ToList();
            }
        }

        public List<string> BusyPorts()
        {
            lock (gate) return busy.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList();
        }

        private void Run()
        {
            while (running)
            {
                try
                {
                    Tick();
                }
                catch (Exception exception)
                {
                    PluginLog.Warn("board scan failed: " + exception.Message);
                }
                nudge.WaitOne(TickMs);
            }
        }

        private void Tick()
        {
            var now = clock.Elapsed.TotalMilliseconds;
            var desired = link.Desired();
            Release(desired.Holds);
            foreach (var release in link.TakeReleases()) Learn(release);
            Reap(now);
            if (now >= nextScan)
            {
                Scan();
                nextScan = now + ScanIntervalMs;
            }
            if (now >= startAt) Open(desired.Holds, now);
            Measure(now);
            link.Report(Status(desired));
        }

        private void Release(HashSet<string> holds)
        {
            List<BoardSession> held;
            lock (gate) held = sessions.Where(session => holds.Contains(session.PortName)).ToList();
            foreach (var session in held)
            {
                Remember(session);
                session.Stop();
                PluginLog.Info(session.PortName + " handed to the configurator");
            }
            lock (gate) sessions.RemoveAll(held.Contains);
        }

        private void Learn(LinkRelease release)
        {
            remember(new KnownPort { Name = release.Port, BaudRate = release.BaudRate });
            silent.Remove(release.Port);
            retryAt.Remove(release.Port);
            lock (gate)
            {
                busy.Remove(release.Port);
                if (sessions.Any(session => string.Equals(session.PortName, release.Port, StringComparison.OrdinalIgnoreCase)))
                    return;
            }
            if (release.Fields != null) handedFields[release.Port] = release.Fields;
            PluginLog.Info(release.Port + " handed back by the configurator");
            PluginTrace.Event(release.Port, $"handed back at {release.BaudRate} baud with " +
                                            (release.Fields == null ? "no fields" : release.Fields.Length + " fields"));
        }

        private void Remember(BoardSession session)
        {
            var fields = session.Fields;
            if (fields.Length > 0) lastFields[session.PortName] = fields;
        }

        private void Reap(double now)
        {
            List<BoardSession> finished;
            lock (gate)
            {
                finished = sessions.Where(session => session.Finished).ToList();
                sessions.RemoveAll(finished.Contains);
            }
            foreach (var session in finished)
            {
                var port = session.PortName;
                Remember(session);
                PluginTrace.Event(port, $"session ended {session.State} {session.Problem}");
                switch (session.State)
                {
                    case BoardState.Silent:
                        silent.Add(port);
                        PluginLog.Info(port + " did not answer as a Pitrig board");
                        break;
                    case BoardState.Busy:
                        lock (gate) busy.Add(port);
                        retryAt[port] = now + BusyRetryMs;
                        break;
                    case BoardState.Lost:
                        retryAt[port] = now + LostRetryMs;
                        PluginLog.Info(port + " lost: " + session.Problem);
                        break;
                }
            }
        }

        private void Scan()
        {
            var names = BoardPorts.Present();
            foreach (var gone in present.Where(name => !names.Contains(name)).ToList())
            {
                silent.Remove(gone);
                lock (gate) busy.Remove(gone);
            }
            if (!names.SetEquals(present)) kinds = BoardPorts.Kinds(names);
            present = names;
        }

        private void Open(HashSet<string> holds, double now)
        {
            var known = knownPorts();
            foreach (var name in present)
            {
                if (holds.Contains(name) || silent.Contains(name)) continue;
                if (retryAt.TryGetValue(name, out var at) && now < at) continue;
                lock (gate)
                {
                    if (sessions.Any(session => string.Equals(session.PortName, name, StringComparison.OrdinalIgnoreCase)))
                        continue;
                }
                var remembered = known.FirstOrDefault(port => string.Equals(port.Name, name, StringComparison.OrdinalIgnoreCase));
                kinds.TryGetValue(name, out var kind);
                if (kind != PortKind.Native && remembered == null) continue;
                var baudRate = remembered != null && remembered.BaudRate > 0 ? remembered.BaudRate : NativeBaudRate;
                handedFields.TryGetValue(name, out var fields);
                handedFields.Remove(name);
                lastFields.TryGetValue(name, out var previous);
                lock (gate) busy.Remove(name);
                PluginTrace.Event(name, $"opening at {baudRate} baud, {kind}");
                var session = new BoardSession(name, baudRate, fields, previous, values);
                lock (gate) sessions.Add(session);
                session.Start();
            }
        }

        private void Measure(double now)
        {
            lock (gate)
            {
                foreach (var session in sessions)
                {
                    if (!samples.TryGetValue(session.PortName, out var sample))
                    {
                        sample = new ByteRate();
                        samples[session.PortName] = sample;
                    }
                    sample.Update(session.BytesSent, now);
                }
            }
        }

        private string Status(LinkDesired desired)
        {
            var boards = new List<string>();
            var released = new List<string>();
            lock (gate)
            {
                foreach (var session in sessions)
                {
                    boards.Add(string.Format(CultureInfo.InvariantCulture, "{0}@{1}:{2}", session.PortName,
                        session.BaudRate, session.Board));
                }
                released.AddRange(desired.Holds.Where(port =>
                    !sessions.Any(session => string.Equals(session.PortName, port, StringComparison.OrdinalIgnoreCase))));
                return "ack=" + desired.Sequence.ToString(CultureInfo.InvariantCulture) +
                       "\nboards=" + string.Join(",", boards) +
                       "\nreleased=" + string.Join(",", released) +
                       "\nbusy=" + string.Join(",", busy) + "\n";
            }
        }
    }
}
