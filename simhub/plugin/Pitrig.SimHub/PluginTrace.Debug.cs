using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;

namespace Pitrig.SimHub
{
    internal static partial class PluginTrace
    {
        private const string FileName = "Pitrig-trace.log";
        private const string SimHubSource = "SimHub";
        private const double PauseMs = 500;
        private const int QueueCapacity = 8192;

        private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;
        private static readonly Stopwatch Clock = Stopwatch.StartNew();
        private static readonly BlockingCollection<string> Pending = new BlockingCollection<string>(QueueCapacity);
        private static readonly ConcurrentDictionary<string, TraceSubject> Subjects =
            new ConcurrentDictionary<string, TraceSubject>(StringComparer.OrdinalIgnoreCase);
        private static readonly Lazy<string> LogFile = new Lazy<string>(StartWriter);

        public static string LogPath => LogFile.Value;

        public static List<string> Describe()
        {
            var now = Now();
            return Subjects.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
                .Select(pair => pair.Value.Describe(pair.Key, now))
                .ToList();
        }

        static partial void OnEvent(string source, string message)
        {
            Subject(source);
            Enqueue(source, message);
        }

        static partial void OnState(string source, string state)
        {
            Subject(source).Enter(state, Now());
            Enqueue(source, "state " + state);
        }

        static partial void OnRequest(string source, string command, double milliseconds, int busyRetries,
            string outcome)
        {
            Subject(source).Requested(busyRetries);
            Enqueue(source, string.Format(Culture, "{0}: {1} after {2:0.0} ms, {3} busy answers repeated",
                command.Trim(), outcome, milliseconds, busyRetries));
        }

        static partial void OnWrite(string source, int bytes, double milliseconds)
        {
            Subject(source).Wrote(bytes, milliseconds, Now());
            if (milliseconds < PauseMs) return;
            Enqueue(source, string.Format(Culture, "the board took {0} bytes only after {1:0} ms", bytes,
                milliseconds));
        }

        static partial void OnUpdate(double now, double costMicroseconds)
        {
            var gap = Subject(SimHubSource).Updated(now, costMicroseconds, Now());
            if (gap >= PauseMs) Enqueue(SimHubSource, string.Format(Culture, "no update for {0:0} ms", gap));
        }

        private static TraceSubject Subject(string source)
        {
            return Subjects.GetOrAdd(source, key => new TraceSubject());
        }

        private static double Now()
        {
            return Clock.Elapsed.TotalMilliseconds;
        }

        private static void Enqueue(string source, string message)
        {
            if (LogFile.Value == null) return;
            Pending.TryAdd(DateTime.Now.ToString("HH:mm:ss.fff", Culture) + " [" + source + "] " + message);
        }

        private static string StartWriter()
        {
            var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs", FileName);
            new Thread(() => Drain(path)) { IsBackground = true, Name = "Pitrig trace" }.Start();
            return path;
        }

        private static void Drain(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                using (var file = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                using (var writer = new StreamWriter(file, new UTF8Encoding(false)))
                {
                    foreach (var line in Pending.GetConsumingEnumerable())
                    {
                        writer.WriteLine(line);
                        if (Pending.Count == 0) writer.Flush();
                    }
                }
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                PluginLog.Warn("trace log unavailable: " + exception.Message);
            }
        }
    }
}
