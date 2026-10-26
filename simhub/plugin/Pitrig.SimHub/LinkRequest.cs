using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Pitrig.SimHub
{
    internal sealed class LinkDesired
    {
        public HashSet<string> Holds { get; set; }

        public long Sequence { get; set; }
    }

    internal sealed class LinkRelease
    {
        public string Port { get; set; }

        public int BaudRate { get; set; }

        public int[] Fields { get; set; }
    }

    internal sealed class LinkRequest
    {
        public int[] Fields { get; private set; }

        public HashSet<string> Holds { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        public List<LinkRelease> Releases { get; } = new List<LinkRelease>();

        public long Sequence { get; private set; }

        public static LinkRequest Parse(byte[] buffer, int offset, int count)
        {
            var request = new LinkRequest();
            foreach (var raw in Encoding.ASCII.GetString(buffer, offset, count).Split('\n'))
            {
                var separator = raw.IndexOf('=');
                if (separator <= 0) continue;
                var key = raw.Substring(0, separator).Trim();
                var value = raw.Substring(separator + 1).Trim();
                switch (key)
                {
                    case "seq":
                        long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number);
                        request.Sequence = number;
                        break;
                    case "fields":
                        request.Fields = CatalogIndex.OfWireIds(value);
                        break;
                    case "hold":
                        if (value.Length > 0) request.Holds.Add(value);
                        break;
                    case "release":
                        var release = Release(value);
                        if (release != null) request.Releases.Add(release);
                        break;
                }
            }
            return request;
        }

        private static LinkRelease Release(string value)
        {
            var at = value.IndexOf('@');
            if (at <= 0) return null;
            var colon = value.IndexOf(':', at);
            var rate = colon < 0 ? value.Substring(at + 1) : value.Substring(at + 1, colon - at - 1);
            if (!int.TryParse(rate, NumberStyles.Integer, CultureInfo.InvariantCulture, out var baudRate) ||
                baudRate <= 0)
            {
                return null;
            }
            return new LinkRelease
            {
                Port = value.Substring(0, at),
                BaudRate = baudRate,
                Fields = colon < 0 ? null : CatalogIndex.OfWireIds(value.Substring(colon + 1))
            };
        }
    }
}
