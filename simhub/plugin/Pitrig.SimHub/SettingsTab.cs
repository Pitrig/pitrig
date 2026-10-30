using System;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using SimHub.Plugins.UI;

namespace Pitrig.SimHub
{
    internal sealed class SettingsTab
    {
        private const double FuelMarginLimit = 10;
        private const double FuelMarginStep = 0.1;
        private const int FuelMarginDecimals = 1;
        private const int MinimumAverageLaps = 1;
        private const int MaximumAverageLaps = 10;
        private const int MinimumPort = 1024;
        private const int MaximumPort = 65535;
        private const double PortWidth = 120;

        private readonly PitrigPlugin plugin;
        private readonly Action<Action<PluginSettings>> change;
        private readonly TitledSlider fuelMargin;
        private readonly TitledSlider averageLaps;
        private readonly TextBox port = new TextBox { Width = PortWidth, HorizontalAlignment = HorizontalAlignment.Left };
        private readonly TextBlock portProblem = PageParts.Text("The port must be a number between 1024 and 65535.");
        private readonly TextBlock addresses = PageParts.Caption(string.Empty);

        public SettingsTab(PitrigPlugin plugin, Action<Action<PluginSettings>> change)
        {
            this.plugin = plugin;
            this.change = change;
            fuelMargin = Slider("Fuel margin, litres or gallons", -FuelMarginLimit, FuelMarginLimit, FuelMarginStep,
                "0.0", TelemetryCatalog.ParameterFuelMargin, plugin.Settings.FuelMargin);
            averageLaps = Slider("Tyre and brake averages over, laps", MinimumAverageLaps, MaximumAverageLaps, 1, "0",
                TelemetryCatalog.ParameterAverageLaps, plugin.Settings.AverageLaps);
            PageParts.Watch(fuelMargin, TitledSlider.ValueProperty, ChangeFuelMargin);
            PageParts.Watch(averageLaps, TitledSlider.ValueProperty, ChangeAverageLaps);
            port.Text = plugin.Settings.Port.ToString(CultureInfo.InvariantCulture);
            port.KeyDown += (sender, arguments) =>
            {
                if (arguments.Key == Key.Enter) ChangePort();
            };
            port.LostFocus += (sender, arguments) => ChangePort();
            portProblem.Foreground = PageParts.ProblemBrush;
            portProblem.Visibility = Visibility.Collapsed;
            var advanced = PageParts.Section("ADVANCED",
                PageParts.Text("Listen port"),
                port,
                portProblem,
                PageParts.Caption("The configurator sends its requests to this port; its Plugin port must match."),
                addresses);
            advanced.Expandable = true;
            advanced.IsExpanded = false;
            Content = PageParts.Stack(
                PageParts.Section("FUEL", fuelMargin, PageParts.Caption(
                    "The fuel margin is added to the fuel to add, in the fuel unit SimHub shows, and a negative one " +
                    "takes fuel off.")),
                PageParts.Section("AVERAGES", averageLaps, PageParts.Caption(
                    "The averages take a sample every three seconds outside the pits and last until SimHub restarts.")),
                advanced);
            addresses.Loaded += (sender, arguments) => addresses.Text = "This machine: " + LocalAddresses();
        }

        public UIElement Content { get; }

        private static TitledSlider Slider(string title, double minimum, double maximum, double step, string format,
            double reset, double value)
        {
            return new TitledSlider
            {
                Title = title,
                Minimum = minimum,
                Maximum = maximum,
                Value = value,
                TickFrequency = step,
                InputInterval = step,
                IsSnapToTickEnabled = true,
                StringFormat = format,
                ShowResetButton = true,
                ResetValue = reset,
                Margin = PageParts.RowMargin
            };
        }

        private void ChangeFuelMargin()
        {
            var margin = Math.Round(fuelMargin.Value, FuelMarginDecimals);
            if (margin != plugin.Settings.FuelMargin) change(settings => settings.FuelMargin = margin);
        }

        private void ChangeAverageLaps()
        {
            var laps = (int)Math.Round(averageLaps.Value);
            if (laps != plugin.Settings.AverageLaps) change(settings => settings.AverageLaps = laps);
        }

        private void ChangePort()
        {
            var valid = int.TryParse(port.Text.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) &&
                        number >= MinimumPort && number <= MaximumPort;
            portProblem.Visibility = valid ? Visibility.Collapsed : Visibility.Visible;
            if (valid && number != plugin.Settings.Port) change(settings => settings.Port = number);
        }

        private static string LocalAddresses()
        {
            var found = NetworkInterface.GetAllNetworkInterfaces()
                .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up)
                .SelectMany(adapter => adapter.GetIPProperties().UnicastAddresses)
                .Select(unicast => unicast.Address)
                .Where(address => address.AddressFamily == AddressFamily.InterNetwork &&
                                  !IPAddress.IsLoopback(address))
                .Select(address => address.ToString())
                .Distinct()
                .ToArray();
            return found.Length == 0 ? "127.0.0.1" : string.Join(", ", found);
        }
    }
}
