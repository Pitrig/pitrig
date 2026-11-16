using System;
using System.IO;
using System.Security;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Pitrig.SimHub
{
    internal static class InstalledPrograms
    {
        private const string Uninstall = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
        private const string DisplayName = "DisplayName";

        private static readonly Tuple<RegistryHive, RegistryView>[] Roots =
        {
            Tuple.Create(RegistryHive.CurrentUser, RegistryView.Default),
            Tuple.Create(RegistryHive.LocalMachine, RegistryView.Registry64),
            Tuple.Create(RegistryHive.LocalMachine, RegistryView.Registry32)
        };

        public static string Find(Regex product, Func<RegistryKey, string> pick)
        {
            foreach (var root in Roots)
            {
                var found = Find(root.Item1, root.Item2, product, pick);
                if (found != null) return found;
            }
            return null;
        }

        private static string Find(RegistryHive hive, RegistryView view, Regex product, Func<RegistryKey, string> pick)
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
                            if (!(entry?.GetValue(DisplayName) is string title) || !product.IsMatch(title)) continue;
                            var found = pick(entry);
                            if (found != null) return found;
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
    }
}
