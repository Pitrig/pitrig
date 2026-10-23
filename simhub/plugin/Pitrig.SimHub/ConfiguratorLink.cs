using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Pitrig.SimHub
{
    internal sealed class ConfiguratorLink : ILineSink
    {
        private const int HeaderBytes = 7;
        private const int SubscriberTimeoutMs = 3000;
        private const int StatusIntervalMs = 1000;
        private const int ConnectionResetControlCode = -1744830452;
        private const int ReceiveCapacity = 8192;
        private const string StatusMarker = "@PT:STATUS\n";

        private readonly byte[] datagram = new byte[HeaderBytes + TelemetryCatalog.LinkMaximumPayload];
        private readonly FieldStream stream = new FieldStream();
        private readonly Stopwatch clock;
        private readonly object gate = new object();
        private readonly List<LinkRelease> releases = new List<LinkRelease>();
        private readonly string version = typeof(ConfiguratorLink).Assembly.GetName().Version.ToString(3);
        private Action nudge;
        private Socket socket;
        private IPEndPoint subscriber;
        private double subscribedAt;
        private bool subscriberIsNew;
        private HashSet<string> holds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private double holdsAt;
        private long sequence;
        private string status = string.Empty;
        private double nextStatus;
        private int length;
        private int datagramSequence;
        private long packetsSent;
        private long sendErrors;

        public ConfiguratorLink(Stopwatch clock)
        {
            this.clock = clock;
            Encoding.ASCII.GetBytes(TelemetryCatalog.LinkMagic, 0, 2, datagram, 0);
            datagram[2] = TelemetryCatalog.LinkVersion;
        }

        public long PacketsSent => Interlocked.Read(ref packetsSent);

        public long LinesSent { get; private set; }

        public long SendErrors => Interlocked.Read(ref sendErrors);

        public bool IsOpen => socket != null;

        public string Target
        {
            get
            {
                lock (gate) return Live() ? subscriber.ToString() : string.Empty;
            }
        }

        public int FieldCount => Ready ? stream.Indices.Length : 0;

        private bool Ready
        {
            get
            {
                lock (gate) return Live();
            }
        }

        public void Start(int port, Action onRequest)
        {
            Close();
            nudge = onRequest;
            var opened = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            try
            {
                opened.IOControl(ConnectionResetControlCode, new byte[] { 0 }, null);
            }
            catch (SocketException)
            {
            }
            try
            {
                opened.Bind(new IPEndPoint(IPAddress.Any, port));
            }
            catch
            {
                opened.Close();
                throw;
            }
            socket = opened;
            length = 0;
            new Thread(() => Listen(opened)) { IsBackground = true, Name = "Pitrig configurator link" }.Start();
        }

        public void Close()
        {
            socket?.Close();
            socket = null;
            lock (gate)
            {
                subscriber = null;
                subscriberIsNew = false;
                holds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                status = string.Empty;
            }
            length = 0;
        }

        public void CollectWanted(bool[] wanted)
        {
            if (!Ready) return;
            foreach (var index in stream.Indices) wanted[index] = true;
        }

        public LinkDesired Desired()
        {
            lock (gate)
            {
                if (clock.Elapsed.TotalMilliseconds - holdsAt > SubscriberTimeoutMs && holds.Count > 0)
                {
                    holds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                }
                return new LinkDesired
                {
                    Holds = new HashSet<string>(holds, StringComparer.OrdinalIgnoreCase),
                    Sequence = sequence
                };
            }
        }

        public List<LinkRelease> TakeReleases()
        {
            lock (gate)
            {
                var taken = releases.ToList();
                releases.Clear();
                return taken;
            }
        }

        public void Report(string text)
        {
            IPEndPoint destination;
            var now = clock.Elapsed.TotalMilliseconds;
            lock (gate)
            {
                if (!Live()) return;
                if (text == status && now < nextStatus) return;
                status = text;
                nextStatus = now + StatusIntervalMs;
                destination = subscriber;
            }
            var payload = Encoding.ASCII.GetBytes(StatusMarker + "version=" + version + "\n" + text);
            if (payload.Length > TelemetryCatalog.LinkMaximumPayload) return;
            var packet = new byte[HeaderBytes + payload.Length];
            Array.Copy(datagram, packet, 3);
            Buffer.BlockCopy(payload, 0, packet, HeaderBytes, payload.Length);
            Send(packet, packet.Length, destination);
        }

        public void Publish(FieldValues values)
        {
            if (socket == null) return;
            if (TakeNewSubscriber()) stream.Restart();
            if (!Ready) return;
            stream.Collect(values, clock.Elapsed.TotalMilliseconds, this);
            Flush();
        }

        public void Add(string wireId, string value)
        {
            var line = wireId + ";" + value + "\n";
            var required = Encoding.UTF8.GetByteCount(line);
            if (required > TelemetryCatalog.LinkMaximumPayload) return;
            if (length + required > TelemetryCatalog.LinkMaximumPayload) Flush();
            length += Encoding.UTF8.GetBytes(line, 0, line.Length, datagram, HeaderBytes + length);
            LinesSent += 1;
        }

        private void Flush()
        {
            if (length == 0) return;
            IPEndPoint destination;
            lock (gate) destination = Live() ? subscriber : null;
            if (destination != null) Send(datagram, HeaderBytes + length, destination);
            length = 0;
        }

        private void Send(byte[] packet, int count, IPEndPoint destination)
        {
            var number = (uint)Interlocked.Increment(ref datagramSequence);
            packet[3] = (byte)number;
            packet[4] = (byte)(number >> 8);
            packet[5] = (byte)(number >> 16);
            packet[6] = (byte)(number >> 24);
            try
            {
                socket?.SendTo(packet, 0, count, SocketFlags.None, destination);
                Interlocked.Increment(ref packetsSent);
            }
            catch (Exception exception) when (exception is SocketException ||
                                              exception is ObjectDisposedException)
            {
                Interlocked.Increment(ref sendErrors);
            }
        }

        private bool TakeNewSubscriber()
        {
            lock (gate)
            {
                if (!subscriberIsNew) return false;
                subscriberIsNew = false;
                return true;
            }
        }

        private bool Live()
        {
            return subscriber != null && clock.Elapsed.TotalMilliseconds - subscribedAt < SubscriberTimeoutMs;
        }

        private void Listen(Socket bound)
        {
            var buffer = new byte[ReceiveCapacity];
            EndPoint from = new IPEndPoint(IPAddress.Any, 0);
            while (true)
            {
                int count;
                try
                {
                    count = bound.ReceiveFrom(buffer, ref from);
                }
                catch (SocketException exception) when (exception.SocketErrorCode == SocketError.MessageSize)
                {
                    continue;
                }
                catch (Exception exception) when (exception is SocketException ||
                                                  exception is ObjectDisposedException)
                {
                    return;
                }
                if (count < HeaderBytes) continue;
                if (Encoding.ASCII.GetString(buffer, 0, 2) != TelemetryCatalog.LinkMagic) continue;
                if (buffer[2] != TelemetryCatalog.LinkVersion) continue;
                try
                {
                    Apply((IPEndPoint)from, LinkRequest.Parse(buffer, HeaderBytes, count - HeaderBytes));
                }
                catch (Exception exception)
                {
                    PluginLog.Warn("configurator request ignored: " + exception.Message);
                }
            }
        }

        private void Apply(IPEndPoint remote, LinkRequest request)
        {
            var control = IPAddress.IsLoopback(remote.Address);
            var changed = false;
            lock (gate)
            {
                if (subscriber == null || !subscriber.Equals(remote))
                {
                    subscriber = remote;
                    subscriberIsNew = true;
                }
                subscribedAt = clock.Elapsed.TotalMilliseconds;
                if (control)
                {
                    changed = !holds.SetEquals(request.Holds) || request.Releases.Count > 0 ||
                              request.Sequence != sequence;
                    holds = request.Holds;
                    holdsAt = subscribedAt;
                    sequence = request.Sequence;
                    releases.AddRange(request.Releases);
                }
            }
            if (request.Fields != null) stream.Subscribe(request.Fields);
            if (changed) nudge?.Invoke();
        }
    }
}
