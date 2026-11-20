using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Pitrig.SimHub
{
    internal sealed class UsageFile
    {
        private static readonly Regex InstallShape = new Regex(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOptions.CultureInvariant);

        private static readonly object Gate = new object();

        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pitrig", "usage.json");

        private static readonly TimeSpan EarlierUse = TimeSpan.FromMinutes(10);

        private UsageFile(string install, bool enabled)
        {
            Install = install;
            Enabled = enabled;
        }

        public string Install { get; }

        public bool Enabled { get; }

        public static UsageFile Read()
        {
            lock (Gate)
            {
                try
                {
                    return File.Exists(FilePath) ? Parse(File.ReadAllText(FilePath)) : Create();
                }
                catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException ||
                                                  exception is SecurityException || exception is ArgumentException ||
                                                  exception is InvalidOperationException)
                {
                    return null;
                }
            }
        }

        public static bool? UsedBefore()
        {
            try
            {
                var file = new FileInfo(FilePath);
                var folder = file.Directory;
                if (!file.Exists || folder == null) return null;
                var oldest = folder.CreationTimeUtc;
                foreach (var entry in folder.EnumerateFileSystemInfos())
                {
                    if (entry.Name.StartsWith(file.Name, StringComparison.OrdinalIgnoreCase)) continue;
                    if (entry.CreationTimeUtc < oldest) oldest = entry.CreationTimeUtc;
                }
                return oldest < file.CreationTimeUtc - EarlierUse;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException ||
                                              exception is SecurityException)
            {
                return null;
            }
        }

        private static UsageFile Create()
        {
            var created = new UsageFile(Guid.NewGuid().ToString("D"), true);
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
            try
            {
                using (var stream = new FileStream(FilePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false)))
                {
                    writer.Write("{\n  \"install\": \"" + created.Install + "\",\n  \"enabled\": true\n}\n");
                }
                return created;
            }
            catch (IOException) when (File.Exists(FilePath))
            {
                return Parse(File.ReadAllText(FilePath));
            }
        }

        private static UsageFile Parse(string text)
        {
            var root = new JavaScriptSerializer().DeserializeObject(text) as Dictionary<string, object>;
            if (root == null || !root.TryGetValue("install", out var install)) return null;
            var id = install as string;
            if (id == null || !InstallShape.IsMatch(id)) return null;
            var disabled = root.TryGetValue("enabled", out var flag) && flag is bool on && !on;
            return new UsageFile(id, !disabled);
        }
    }
}
