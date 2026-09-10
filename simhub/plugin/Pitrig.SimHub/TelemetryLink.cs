using System;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Pitrig.SimHub
{
    internal sealed class TelemetryLink
    {
        private const int HeaderBytes = 7;
        private const int SubscriberTimeoutMs = 3000;
        private const int ConnectionResetControlCode = -1744830452;
        private const int ReceiveCapacity = 64;

        private readonly byte[] datagram = new byte[HeaderBytes + TelemetryCatalog.LinkMaximumPayload];
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly object gate = new object();
        private Socket socket;
        private IPEndPoint subscriber;
        private double subscribedAt;
        private bool subscriberIsNew;
        private int length;
        private uint sequence;

        public TelemetryLink()
        {
            Encoding.ASCII.GetBytes(TelemetryCatalog.LinkMagic, 0, 2, datagram, 0);
            datagram[2] = TelemetryCatalog.LinkVersion;
        }

        public long PacketsSent { get; private set; }

        public long LinesSent { get; private set; }

        public long SendErrors { get; private set; }

        public string Target
        {
            get
            {
                lock (gate) return Live() ? subscriber.ToString() : string.Empty;
            }
        }

        public bool Ready
        {
            get
            {
                lock (gate) return Live();
            }
        }

        public static string LocalAddresses()
        {
            var addresses = NetworkInterface.GetAllNetworkInterfaces()
                .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up)
                .SelectMany(adapter => adapter.GetIPProperties().UnicastAddresses)
                .Select(unicast => unicast.Address)
                .Where(address => address.AddressFamily == AddressFamily.InterNetwork &&
                                  !IPAddress.IsLoopback(address))
                .Select(address => address.ToString())
                .Distinct()
                .ToArray();
            return addresses.Length == 0 ? "127.0.0.1" : string.Join(", ", addresses);
        }

        public void Open(int port)
        {
            Close();
            var opened = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            try
            {
                opened.IOControl(ConnectionResetControlCode, new byte[] { 0 }, null);
            }
            catch (SocketException)
            {
            }
            opened.Bind(new IPEndPoint(IPAddress.Any, port));
            socket = opened;
            length = 0;
            var listener = new Thread(() => Listen(opened)) { IsBackground = true };
            listener.Start();
        }

        public void Close()
        {
            socket?.Close();
            socket = null;
            lock (gate)
            {
                subscriber = null;
                subscriberIsNew = false;
            }
            length = 0;
        }

        public bool TakeNewSubscriber()
        {
            lock (gate)
            {
                if (!subscriberIsNew) return false;
                subscriberIsNew = false;
                return true;
            }
        }

        public void Add(string wireId, string value)
        {
            if (socket == null) return;
            var line = wireId + ";" + value + "\n";
            var required = Encoding.UTF8.GetByteCount(line);
            if (required > TelemetryCatalog.LinkMaximumPayload) return;
            if (length + required > TelemetryCatalog.LinkMaximumPayload) Flush();
            length += Encoding.UTF8.GetBytes(line, 0, line.Length, datagram, HeaderBytes + length);
            LinesSent += 1;
        }

        public void Flush()
        {
            if (length == 0) return;
            IPEndPoint destination;
            lock (gate) destination = Live() ? subscriber : null;
            if (destination == null)
            {
                length = 0;
                return;
            }
            datagram[3] = (byte)sequence;
            datagram[4] = (byte)(sequence >> 8);
            datagram[5] = (byte)(sequence >> 16);
            datagram[6] = (byte)(sequence >> 24);
            try
            {
                socket.SendTo(datagram, 0, HeaderBytes + length, SocketFlags.None, destination);
                PacketsSent += 1;
            }
            catch (Exception exception) when (exception is SocketException ||
                                              exception is ObjectDisposedException)
            {
                SendErrors += 1;
            }
            sequence += 1;
            length = 0;
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
                if (count != HeaderBytes) continue;
                if (Encoding.ASCII.GetString(buffer, 0, 2) != TelemetryCatalog.LinkMagic) continue;
                if (buffer[2] != TelemetryCatalog.LinkVersion) continue;
                Subscribe((IPEndPoint)from);
            }
        }

        private void Subscribe(IPEndPoint remote)
        {
            lock (gate)
            {
                if (subscriber == null || !subscriber.Equals(remote))
                {
                    subscriber = remote;
                    subscriberIsNew = true;
                }
                subscribedAt = clock.Elapsed.TotalMilliseconds;
            }
        }
    }
}
