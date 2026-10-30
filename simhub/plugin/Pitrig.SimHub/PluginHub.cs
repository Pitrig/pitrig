using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class PluginHub
    {
        private const double ChangesIntervalMs = 100;
        private const double CostWeight = 0.02;
        private const double SecondMs = 1000;

        private static readonly Lazy<PluginHub> Instance = new Lazy<PluginHub>(() => new PluginHub());

        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly FieldValues values = new FieldValues();
        private readonly TelemetryState state = new TelemetryState();
        private readonly double[] due = new double[TelemetryCatalog.Fields.Length];
        private readonly bool[] wanted = new bool[TelemetryCatalog.Fields.Length];
        private readonly object settingsGate = new object();
        private readonly ConfiguratorLink link;
        private readonly BoardManager boards;
        private PitrigPlugin owner;
        private PluginSettings settings = new PluginSettings();
        private int settingsDirty;
        private int stateStale = 1;
        private volatile bool running;
        private int linkPort = -1;
        private long costNanoseconds;
        private int updates;
        private int updatesPerSecond;
        private double secondStartedAt;

        private PluginHub()
        {
            link = new ConfiguratorLink(clock);
            boards = new BoardManager(values, link, clock, state.Inputs);
            state.Inputs.Listen(link.ReportInput);
            AppDomain.CurrentDomain.ProcessExit += (sender, arguments) => Shutdown();
        }

        public static PluginHub Shared => Instance.Value;

        public string Error { get; private set; }

        public ConfiguratorLink Link => link;

        public BoardManager Boards => boards;

        public string ShiftSource => state.Shifts.Source;

        public InputState Inputs => state.Inputs;

        public double CostMicroseconds => Interlocked.Read(ref costNanoseconds) / 1000.0;

        public int UpdatesPerSecond => Volatile.Read(ref updatesPerSecond);

        public void Attach(PitrigPlugin plugin)
        {
            owner = plugin;
            Interlocked.Exchange(ref stateStale, 1);
            Apply(plugin.Settings);
        }

        public void Detach(PitrigPlugin plugin)
        {
            if (ReferenceEquals(owner, plugin)) owner = null;
        }

        public void Apply(PluginSettings next)
        {
            lock (settingsGate) settings = next;
            Error = null;
            if (!next.Enabled)
            {
                Shutdown();
                return;
            }
            if (!running) Interlocked.Exchange(ref stateStale, 1);
            if (linkPort != next.Port || !link.IsOpen)
            {
                try
                {
                    link.Start(next.Port, boards.Nudge);
                    linkPort = next.Port;
                }
                catch (Exception exception)
                {
                    Error = exception.Message;
                    linkPort = -1;
                }
            }
            boards.Start(KnownPorts, Remember);
            running = true;
        }

        public void Shutdown()
        {
            running = false;
            boards.Stop();
            link.Close();
            linkPort = -1;
        }

        public void Update(PluginManager pluginManager, GameData data)
        {
            if (!running) return;
            var started = clock.ElapsedTicks;
            var now = clock.Elapsed.TotalMilliseconds;
            if (Interlocked.Exchange(ref settingsDirty, 0) == 1) owner?.SaveSettings();
            if (Interlocked.Exchange(ref stateStale, 0) == 1) state.Reset();
            PluginSettings current;
            lock (settingsGate) current = settings;
            state.Update(pluginManager, data, current, now);
            Array.Clear(wanted, 0, wanted.Length);
            boards.CollectWanted(wanted);
            link.CollectWanted(wanted);
            var fields = TelemetryCatalog.Fields;
            for (var index = 0; index < fields.Length; index += 1)
            {
                if (!wanted[index] || now < due[index]) continue;
                due[index] = Math.Max(due[index] + IntervalOf(fields[index].Rate), now);
                values.Set(index, FieldReader.Read(state, fields[index]));
            }
            link.Publish(values);
            boards.WakeAll();
            Measure(started, now);
        }

        private List<KnownPort> KnownPorts()
        {
            lock (settingsGate) return settings.KnownPorts?.ToList() ?? new List<KnownPort>();
        }

        private void Remember(KnownPort port)
        {
            lock (settingsGate)
            {
                var known = settings.KnownPorts ?? new List<KnownPort>();
                if (known.Any(entry => string.Equals(entry.Name, port.Name, StringComparison.OrdinalIgnoreCase) &&
                                       entry.BaudRate == port.BaudRate))
                {
                    return;
                }
                settings.KnownPorts = known
                    .Where(entry => !string.Equals(entry.Name, port.Name, StringComparison.OrdinalIgnoreCase))
                    .Concat(new[] { port })
                    .ToList();
            }
            Interlocked.Exchange(ref settingsDirty, 1);
        }

        private void Measure(long started, double now)
        {
            var elapsed = (clock.ElapsedTicks - started) * 1e9 / Stopwatch.Frequency;
            PluginTrace.Update(now, elapsed / 1000);
            var smoothed = Interlocked.Read(ref costNanoseconds);
            Interlocked.Exchange(ref costNanoseconds, (long)(smoothed + (elapsed - smoothed) * CostWeight));
            updates += 1;
            if (now - secondStartedAt < SecondMs) return;
            Volatile.Write(ref updatesPerSecond, updates);
            updates = 0;
            secondStartedAt = now;
        }

        private static double IntervalOf(FieldRate rate)
        {
            switch (rate)
            {
                case FieldRate.Fast:
                    return 1000.0 / TelemetryCatalog.FastHertz;
                case FieldRate.Normal:
                    return 1000.0 / TelemetryCatalog.NormalHertz;
                case FieldRate.Slow:
                    return 1000.0 / TelemetryCatalog.SlowHertz;
                default:
                    return ChangesIntervalMs;
            }
        }
    }
}
