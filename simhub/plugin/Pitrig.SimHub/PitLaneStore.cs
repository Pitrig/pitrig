using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Pitrig.SimHub
{
    internal sealed class PitLane
    {
        public const int FormatVersion = 1;

        public int Version { get; set; } = FormatVersion;

        public double From { get; set; }

        public double To { get; set; }

        public double[][] Points { get; set; }

        public bool Usable => Version == FormatVersion && Points != null && Points.Length >= 2 &&
                              Points.All(point => point != null && point.Length == 2);

        public double Span => TrackOutline.Wrap(To - From);
    }

    internal static class PitLaneStore
    {
        private static readonly string Root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pitrig", "pit-lanes");

        public static PitLane Load(TrackIdentity track)
        {
            try
            {
                var path = PathOf(track);
                if (!File.Exists(path)) return null;
                var pit = Serializer().Deserialize<PitLane>(File.ReadAllText(path, Encoding.UTF8));
                return pit != null && pit.Usable ? pit : null;
            }
            catch (Exception exception) when (exception is IOException || exception is ArgumentException ||
                                              exception is InvalidOperationException ||
                                              exception is UnauthorizedAccessException)
            {
                return null;
            }
        }

        public static void Save(TrackIdentity track, PitLane pit)
        {
            try
            {
                var path = PathOf(track);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                var temporary = path + ".tmp";
                File.WriteAllText(temporary, Serializer().Serialize(pit), Encoding.UTF8);
                if (File.Exists(path)) File.Delete(path);
                File.Move(temporary, path);
            }
            catch (Exception exception) when (exception is IOException || exception is ArgumentException ||
                                              exception is InvalidOperationException ||
                                              exception is UnauthorizedAccessException)
            {
            }
        }

        private static string PathOf(TrackIdentity track)
        {
            return Path.Combine(Root, track.Game, track.FileName + ".json");
        }

        private static JavaScriptSerializer Serializer()
        {
            return new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        }
    }
}
