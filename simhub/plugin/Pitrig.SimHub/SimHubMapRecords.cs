using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Pitrig.SimHub
{
    internal static class SimHubMapRecords
    {
        private const string Extension = "*.shtl";
        private const int MinimumPoints = 32;

        private static readonly ConcurrentDictionary<string, Header> Headers =
            new ConcurrentDictionary<string, Header>(StringComparer.OrdinalIgnoreCase);

        public static TrackOutline Find(string game, TrackIdentity track)
        {
            var root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "PluginsData", game ?? string.Empty);
            return Search(Path.Combine(root, "MapRecords"), track) ?? Search(Path.Combine(root, "MapRecordsCloud"), track);
        }

        private static TrackOutline Search(string folder, TrackIdentity track)
        {
            string[] files;
            try
            {
                if (!Directory.Exists(folder)) return null;
                files = Directory.GetFiles(folder, Extension);
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                return null;
            }
            foreach (var file in files.OrderByDescending(file => track.NamedIn(Path.GetFileNameWithoutExtension(file))))
            {
                var written = WrittenAt(file);
                if (Headers.TryGetValue(file, out var known) && known.Written == written &&
                    !track.Matches(known.Name, known.Configuration))
                {
                    continue;
                }
                var record = Read(file);
                if (record == null) continue;
                var header = new Header
                {
                    Written = written,
                    Name = Text(record, "TrackName"),
                    Configuration = Text(record, "TrackConfig")
                };
                Headers[file] = header;
                if (!track.Matches(header.Name, header.Configuration)) continue;
                var outline = Convert(record, track);
                if (outline != null) return outline;
            }
            return null;
        }

        private static DateTime WrittenAt(string file)
        {
            try
            {
                return File.GetLastWriteTimeUtc(file);
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                return DateTime.MinValue;
            }
        }

        private static Dictionary<string, object> Read(string file)
        {
            try
            {
                using (var stream = File.OpenRead(file))
                using (var gzip = new GZipStream(stream, CompressionMode.Decompress))
                using (var reader = new StreamReader(gzip, Encoding.UTF8))
                {
                    var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                    return serializer.DeserializeObject(reader.ReadToEnd()) as Dictionary<string, object>;
                }
            }
            catch (Exception exception) when (exception is IOException || exception is InvalidDataException ||
                                              exception is ArgumentException || exception is InvalidOperationException ||
                                              exception is UnauthorizedAccessException)
            {
                return null;
            }
        }

        private static TrackOutline Convert(Dictionary<string, object> record, TrackIdentity track)
        {
            if (!record.TryGetValue("CarCoordinates", out var listed) || !(listed is IEnumerable points)) return null;
            var samples = new List<Sample>();
            foreach (var item in points)
            {
                var sample = Sample.Of(item as Dictionary<string, object>, samples.Count, track);
                if (sample != null) samples.Add(sample);
            }
            if (samples.Count < MinimumPoints) return null;
            var length = Number(record, "ReportedTrackLength") ?? track.LengthMeters;
            var loop = TrackOutline.ResampleLoop(samples.Select(sample => sample.AsArray()).ToList(),
                TrackOutline.PointCount(length ?? double.NaN));
            if (loop == null) return null;
            var timed = samples.OrderBy(sample => sample.Order).ToList();
            return new TrackOutline
            {
                Points = loop,
                Finish = timed[0].Fraction,
                Sectors = SectorStarts(timed)
            };
        }

        private static double[] SectorStarts(List<Sample> timed)
        {
            var starts = new List<double>();
            for (var index = 1; index < timed.Count; index += 1)
            {
                var sector = timed[index].Sector;
                if (sector.HasValue && sector == timed[index - 1].Sector + 1 && sector == starts.Count + 2)
                {
                    starts.Add(timed[index].Fraction);
                }
            }
            return starts.ToArray();
        }

        private static string Text(Dictionary<string, object> record, string key)
        {
            return record.TryGetValue(key, out var value) ? value as string : null;
        }

        private static double? Number(Dictionary<string, object> record, string key)
        {
            return record.TryGetValue(key, out var value) ? Computed.Number(value) : null;
        }

        private sealed class Header
        {
            public DateTime Written;
            public string Name;
            public string Configuration;
        }

        private sealed class Sample
        {
            public double Fraction;
            public double X;
            public double Y;
            public int? Sector;
            public double Order;

            public double[] AsArray()
            {
                return new[] { Fraction, X, Y };
            }

            public static Sample Of(Dictionary<string, object> point, int index, TrackIdentity track)
            {
                if (point == null || !point.TryGetValue("p", out var fraction) ||
                    !point.TryGetValue("Value", out var value) || !(value is IList position) || position.Count < 3)
                {
                    return null;
                }
                var p = Computed.Number(fraction);
                var x = Computed.Number(position[0]);
                var z = Computed.Number(position[2]);
                if (p == null || x == null || z == null) return null;
                var mapped = track.MapPoint(x.Value, z.Value);
                return new Sample
                {
                    Fraction = TrackOutline.Wrap(p.Value),
                    X = mapped[0],
                    Y = mapped[1],
                    Sector = point.TryGetValue("CurrentSector", out var sector) ? Computed.Number(sector) is double s
                        ? (int?)(int)s
                        : null : null,
                    Order = point.TryGetValue("Key", out var key) && TimeSpan.TryParse(key as string,
                        CultureInfo.InvariantCulture, out var time)
                        ? time.TotalSeconds
                        : index
                };
            }
        }
    }
}
