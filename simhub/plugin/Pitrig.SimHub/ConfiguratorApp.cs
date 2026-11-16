using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

namespace Pitrig.SimHub
{
    internal static class ConfiguratorApp
    {
        public const string DownloadPage = "https://www.pitrig.com/download";

        private const string DisplayIcon = "DisplayIcon";

        private static readonly Regex ProductName = new Regex(@"^Pitrig \d", RegexOptions.CultureInvariant);

        public static string Find()
        {
            return InstalledPrograms.Find(ProductName, entry => ExecutableOf(entry.GetValue(DisplayIcon) as string));
        }

        public static void Open(string executable)
        {
            Start(executable ?? DownloadPage);
        }

        public static void Start(string target)
        {
            try
            {
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
            }
            catch (Exception exception) when (exception is Win32Exception || exception is FileNotFoundException ||
                                              exception is InvalidOperationException)
            {
                PluginLog.Warn("could not open " + target + ": " + exception.Message);
            }
        }

        private static string ExecutableOf(string icon)
        {
            if (string.IsNullOrEmpty(icon)) return null;
            var comma = icon.LastIndexOf(',');
            var path = (comma > 0 ? icon.Substring(0, comma) : icon).Trim().Trim('"');
            return path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(path) ? path : null;
        }
    }
}
