using System;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Pitrig.SimHub
{
    internal sealed class TelemetryLink
    {
        private const int HeaderBytes = 7;

        private readonly byte[] datagram = new byte[HeaderBytes + TelemetryCatalog.LinkMaximumPayload];
        private Socket socket;
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

        public string Target { get; private set; } = string.Empty;

        public void Connect(string host, int port)
        {
            Close();
            var address = Dns.GetHostAddresses(host)[0];
            socket = new Socket(address.AddressFamily, SocketType.Dgram, ProtocolType.Udp);
            socket.Connect(new IPEndPoint(address, port));
            Target = address + ":" + port;
            length = 0;
        }

        public void Close()
        {
            socket?.Close();
            socket = null;
            Target = string.Empty;
            length = 0;
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
            if (length == 0 || socket == null) return;
            datagram[3] = (byte)sequence;
            datagram[4] = (byte)(sequence >> 8);
            datagram[5] = (byte)(sequence >> 16);
            datagram[6] = (byte)(sequence >> 24);
            try
            {
                socket.Send(datagram, 0, HeaderBytes + length, SocketFlags.None);
                PacketsSent += 1;
            }
            catch (SocketException)
            {
                SendErrors += 1;
            }
            sequence += 1;
            length = 0;
        }
    }
}
