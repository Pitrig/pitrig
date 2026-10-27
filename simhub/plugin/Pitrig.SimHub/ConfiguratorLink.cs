using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Pitrig.SimHub
{
    internal sealed partial class ConfiguratorLink : ILineSink
    {
        private const int HeaderBytes = 7;
        private const int SubscriberTimeoutMs = 3000;
        private const int StatusIntervalMs = 1000;
        private const int ConnectionResetControlCode = -1744830452;
        private const int ReceiveCapacity = 65536;
        private const string StatusMarker = "@PT:STATUS\n";
        private const string InputMarker = "@PT:INPUT\n";
        private const string TraceSource = "configurator";

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
        private double inputsAt = double.NegativeInfinity;
        private InputMapping wiring;
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
                inputsAt = double.NegativeInfinity;
                wiring = null;
                status = string.Empty;
            }
            length = 0;
        }

        public void CollectWanted(bool[] wanted)
        {
            if (!Ready) return;
            foreach (var index in stream.Indices) wanted[index] = true;
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
            SendText(StatusMarker + "version=" + version + "\n" + text, destination);
        }

        public void ReportInput(string text)
        {
            IPEndPoint destination;
            lock (gate)
            {
                if (!Live() || clock.Elapsed.TotalMilliseconds - inputsAt > SubscriberTimeoutMs) return;
                destination = subscriber;
            }
            SendText(InputMarker + text, destination);
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

        private void SendText(string text, IPEndPoint destination)
        {
            var payload = Encoding.UTF8.GetBytes(text);
            if (payload.Length > TelemetryCatalog.LinkMaximumPayload) return;
            var packet = new byte[HeaderBytes + payload.Length];
            Array.Copy(datagram, packet, 3);
            Buffer.BlockCopy(payload, 0, packet, HeaderBytes, payload.Length);
            Send(packet, packet.Length, destination);
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

        private bool Live()
        {
            return subscriber != null && clock.Elapsed.TotalMilliseconds - subscribedAt < SubscriberTimeoutMs;
        }
    }
}
