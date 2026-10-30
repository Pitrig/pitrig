using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Security;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Pitrig.SimHub
{
    internal static class ConfiguratorApp
    {
        public const string DownloadPage = "https://www.pitrig.com/download";

        private const string Uninstall = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
        private const string DisplayName = "DisplayName";
        private const string DisplayIcon = "DisplayIcon";

        private static readonly Regex ProductName = new Regex(@"^Pitrig \d", RegexOptions.CultureInvariant);

        private static readonly Tuple<RegistryHive, RegistryView>[] Roots =
        {
            Tuple.Create(RegistryHive.CurrentUser, RegistryView.Default),
            Tuple.Create(RegistryHive.LocalMachine, RegistryView.Registry64),
            Tuple.Create(RegistryHive.LocalMachine, RegistryView.Registry32)
        };

        public static string Find()
        {
            foreach (var root in Roots)
            {
                var found = Find(root.Item1, root.Item2);
                if (found != null) return found;
            }
            return null;
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

        private static string Find(RegistryHive hive, RegistryView view)
        {
            try
            {
                using (var root = RegistryKey.OpenBaseKey(hive, view))
                using (var entries = root.OpenSubKey(Uninstall))
                {
                    if (entries == null) return null;
                    foreach (var name in entries.GetSubKeyNames())
                    {
                        using (var entry = entries.OpenSubKey(name))
                        {
                            if (!(entry?.GetValue(DisplayName) is string product) || !ProductName.IsMatch(product)) continue;
                            var executable = ExecutableOf(entry.GetValue(DisplayIcon) as string);
                            if (executable != null) return executable;
                        }
                    }
                }
            }
            catch (Exception exception) when (exception is SecurityException || exception is UnauthorizedAccessException ||
                                              exception is IOException)
            {
            }
            return null;
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
