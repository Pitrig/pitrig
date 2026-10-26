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

        public InputMapping Wiring { get; set; }
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

        public bool Inputs { get; private set; }

        public InputMapping Wiring { get; private set; }

        public static LinkRequest Parse(byte[] buffer, int offset, int count)
        {
            var request = new LinkRequest();
            var wired = false;
            var buttons = new List<KeyValuePair<int, string>>();
            var positions = new List<KeyValuePair<int, string>>();
            foreach (var raw in Encoding.UTF8.GetString(buffer, offset, count).Split('\n'))
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
                    case "inputs":
                        request.Inputs = value == "1";
                        break;
                    case "wiring":
                        wired = value == "1";
                        break;
                    case "button":
                        Numbered(value, buttons);
                        break;
                    case "position":
                        Numbered(value, positions);
                        break;
                    case "release":
                        var release = Release(value);
                        if (release != null) request.Releases.Add(release);
                        break;
                }
            }
            if (wired) request.Wiring = InputMapping.Of(buttons, positions);
            return request;
        }

        private static void Numbered(string value, List<KeyValuePair<int, string>> entries)
        {
            var colon = value.IndexOf(':');
            if (colon <= 0 || !int.TryParse(value.Substring(0, colon), NumberStyles.Integer, CultureInfo.InvariantCulture,
                    out var number))
            {
                return;
            }
            entries.Add(new KeyValuePair<int, string>(number, value.Substring(colon + 1)));
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
