using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using Microsoft.Win32;

namespace Pitrig.SimHub
{
    internal enum PortKind
    {
        Unknown,
        Native,
        Bridge
    }

    internal static class BoardPorts
    {
        private const string SerialComm = @"HARDWARE\DEVICEMAP\SERIALCOMM";
        private const string UsbDevices = @"SYSTEM\CurrentControlSet\Enum\USB";
        private const string Parameters = "Device Parameters";
        private const string PortName = "PortName";

        private static readonly string[] NativeDevices =
        {
            "VID_303A&PID_4001&MI_00",
            "VID_303A&PID_4001"
        };

        private static readonly string[] BridgeDevices =
        {
            "VID_1A86&PID_7523",
            "VID_1A86&PID_55D4",
            "VID_10C4&PID_EA60"
        };

        public static HashSet<string> Present()
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(SerialComm))
                {
                    if (key == null) return names;
                    foreach (var value in key.GetValueNames())
                    {
                        if (key.GetValue(value) is string name && name.Length > 0) names.Add(name);
                    }
                }
            }
            catch (Exception exception) when (Unreadable(exception))
            {
            }
            return names;
        }

        public static Dictionary<string, PortKind> Kinds(HashSet<string> present)
        {
            var kinds = new Dictionary<string, PortKind>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using (var usb = Registry.LocalMachine.OpenSubKey(UsbDevices))
                {
                    if (usb == null) return kinds;
                    Collect(usb, NativeDevices, PortKind.Native, present, kinds);
                    Collect(usb, BridgeDevices, PortKind.Bridge, present, kinds);
                }
            }
            catch (Exception exception) when (Unreadable(exception))
            {
            }
            return kinds;
        }

        private static void Collect(RegistryKey usb, string[] devices, PortKind kind, HashSet<string> present,
            Dictionary<string, PortKind> kinds)
        {
            foreach (var device in devices)
            {
                using (var instances = usb.OpenSubKey(device))
                {
                    if (instances == null) continue;
                    foreach (var instance in instances.GetSubKeyNames())
                    {
                        using (var parameters = instances.OpenSubKey(instance + @"\" + Parameters))
                        {
                            if (!(parameters?.GetValue(PortName) is string name)) continue;
                            if (present.Contains(name) && !kinds.ContainsKey(name)) kinds[name] = kind;
                        }
                    }
                }
            }
        }

        private static bool Unreadable(Exception exception)
        {
            return exception is SecurityException || exception is UnauthorizedAccessException ||
                   exception is IOException;
        }
    }
}
