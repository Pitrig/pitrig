using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace Pitrig.SimHub
{
    internal sealed partial class UsageReporter
    {
        private const string Endpoint = "https://www.pitrig.com/api/app";
        private const string Agent = "Pitrig-SimHub/";
        private const string DisplayVersion = "DisplayVersion";
        private const string InstallLocation = "InstallLocation";
        private const string SimHubExecutable = "SimHubWPF.exe";
        private const int TimeoutMs = 10000;
        private const int DetailLength = 48;

        private static readonly TimeSpan FirstCheck = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(10);
        private static readonly Regex Unsafe = new Regex("[^A-Za-z0-9._:-]+", RegexOptions.CultureInvariant);
        private static readonly Regex SimHubName = new Regex("^SimHub", RegexOptions.CultureInvariant);
        private static readonly Lazy<string> SimHubVersion =
            new Lazy<string>(() => InstalledPrograms.Find(SimHubName, SimHubVersionOf));

        private readonly object gate = new object();
        private readonly HashSet<string> sent = new HashSet<string>();
        private readonly string version = typeof(PitrigPlugin).Assembly.GetName().Version.ToString(3);
        private readonly BoardManager boards;
        private Timer timer;
        private volatile bool active;
        private string sentDay = string.Empty;
        private string lastGame;
        private DateTime lastGameDay;
        private long lastRaceTicks;

        public UsageReporter(BoardManager boards)
        {
            this.boards = boards;
        }

        public void Start()
        {
            var development = false;
            MarkDevelopment(ref development);
            if (development) return;
            lock (gate)
            {
                if (timer != null) return;
                timer = new Timer(tick => Check(), null, FirstCheck, CheckInterval);
            }
            active = true;
        }

        public void ObserveGame(string game, bool running)
        {
            if (!active || !running || string.IsNullOrEmpty(game)) return;
            var now = DateTime.UtcNow;
            Interlocked.Exchange(ref lastRaceTicks, now.Ticks);
            var day = now.Date;
            if (day == lastGameDay && string.Equals(game, lastGame, StringComparison.Ordinal)) return;
            lastGame = game;
            lastGameDay = day;
            Report("game", null, game);
        }

        static partial void MarkDevelopment(ref bool development);

        private void Check()
        {
            try
            {
                if (DateTime.UtcNow.Ticks - Interlocked.Read(ref lastRaceTicks) <= CheckInterval.Ticks)
                {
                    foreach (var board in boards.Describe())
                    {
                        if (board.State == BoardState.Streaming && !string.IsNullOrEmpty(board.Board))
                        {
                            Report("board", board.Board, board.Firmware);
                        }
                    }
                }
                Report("plugin", null, SimHubVersion.Value);
            }
            catch (Exception exception)
            {
                PluginLog.Warn("usage check failed: " + exception.Message);
            }
        }

        private void Report(string name, string board, string detail)
        {
            var day = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var key = name + "|" + board + "|" + detail;
            lock (gate)
            {
                if (sentDay != day)
                {
                    sent.Clear();
                    sentDay = day;
                }
                if (!sent.Add(key)) return;
            }
            ThreadPool.QueueUserWorkItem(work => Send(key, name, board, detail));
        }

        private void Send(string key, string name, string board, string detail)
        {
            try
            {
                var usage = UsageFile.Read();
                if (usage == null || !usage.Enabled) return;
                Post(Payload(usage.Install, name, board, detail));
            }
            catch (WebException exception) when (exception.Status == WebExceptionStatus.ProtocolError)
            {
                exception.Response?.Close();
            }
            catch (Exception)
            {
                lock (gate) sent.Remove(key);
            }
        }

        private string Payload(string install, string name, string board, string detail)
        {
            var body = new Dictionary<string, object>
            {
                ["install"] = install,
                ["event"] = name,
                ["version"] = version,
                ["os"] = "win32",
                ["arch"] = Environment.Is64BitOperatingSystem ? "x64" : "ia32"
            };
            var boardId = Clean(board);
            if (boardId.Length > 0) body["board"] = boardId;
            var text = Clean(detail);
            if (text.Length > 0) body["detail"] = text;
            return new JavaScriptSerializer().Serialize(body);
        }

        private void Post(string json)
        {
            var request = (HttpWebRequest)WebRequest.Create(Endpoint);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.UserAgent = Agent + version;
            request.Timeout = TimeoutMs;
            request.ReadWriteTimeout = TimeoutMs;
            var bytes = Encoding.UTF8.GetBytes(json);
            request.ContentLength = bytes.Length;
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            request.GetResponse().Dispose();
        }

        private static string SimHubVersionOf(RegistryKey entry)
        {
            var folder = (entry.GetValue(InstallLocation) as string)?.Trim().Trim('"');
            if (string.IsNullOrEmpty(folder)) return null;
            try
            {
                return File.Exists(Path.Combine(folder, SimHubExecutable)) ? entry.GetValue(DisplayVersion) as string : null;
            }
            catch (ArgumentException)
            {
                return null;
            }
        }

        private static string Clean(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            var text = Unsafe.Replace(value.Trim(), "-").TrimStart('.', '_', ':', '-');
            return text.Length > DetailLength ? text.Substring(0, DetailLength) : text;
        }
    }
}
