using System;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace Pitrig.SimHub
{
    internal sealed partial class SettingsControl : UserControl
    {
        private const double MaximumReserveLaps = 10;
        private const int MaximumAverageLaps = 10;

        private static readonly Thickness RowMargin = new Thickness(0, 4, 0, 0);
        private static readonly Thickness SectionMargin = new Thickness(0, 14, 0, 0);

        private readonly PitrigPlugin plugin;
        private readonly TextBox port = new TextBox();
        private readonly TextBox reserveLaps = new TextBox();
        private readonly TextBox averageLaps = new TextBox();
        private readonly CheckBox enabled = new CheckBox { Content = "Send telemetry" };
        private readonly TextBlock boards = Wrapped();
        private readonly TextBlock configurator = Wrapped();
        private readonly TextBlock addresses = Wrapped();
        private readonly TextBlock shifts = Wrapped();
        private readonly TextBlock cost = Wrapped();
        private readonly TextBlock state = Wrapped();
        private readonly DispatcherTimer refresh = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(500)
        };

        public SettingsControl(PitrigPlugin plugin)
        {
            this.plugin = plugin;
            port.Text = plugin.Settings.Port.ToString(CultureInfo.InvariantCulture);
            reserveLaps.Text = plugin.Settings.FuelReserveLaps.ToString(CultureInfo.InvariantCulture);
            averageLaps.Text = plugin.Settings.AverageLaps.ToString(CultureInfo.InvariantCulture);
            enabled.IsChecked = plugin.Settings.Enabled;
            Content = Layout();
            refresh.Tick += (sender, arguments) => ShowState();
            Loaded += (sender, arguments) =>
            {
                addresses.Text = "This machine: " + LocalAddresses();
                refresh.Start();
            };
            Unloaded += (sender, arguments) => refresh.Stop();
            ShowState();
        }

        private UIElement Layout()
        {
            var apply = new Button { Content = "Apply", Margin = RowMargin, Padding = new Thickness(12, 2, 12, 2) };
            apply.Click += (sender, arguments) => Apply();
            var panel = new StackPanel { Margin = new Thickness(12) };
            panel.Children.Add(new TextBlock
            {
                Text = "Pitrig finds its boards by itself and sends each one the telemetry its dashboard uses. " +
                       "While the Pitrig configurator is connected to a board it takes the board over and " +
                       "passes this telemetry on, and the board comes back here when it lets go.",
                TextWrapping = TextWrapping.Wrap
            });
            panel.Children.Add(Heading("Boards"));
            panel.Children.Add(boards);
            panel.Children.Add(Heading("Configurator"));
            panel.Children.Add(configurator);
            addresses.Margin = RowMargin;
            panel.Children.Add(addresses);
            panel.Children.Add(Row("Listen port", port));
            panel.Children.Add(Heading("Fuel and averages"));
            panel.Children.Add(Row("Fuel reserve, laps", reserveLaps));
            panel.Children.Add(Row("Tyre and brake averages over, laps", averageLaps));
            panel.Children.Add(new TextBlock
            {
                Text = "These match the configurator's SimHub profile export. The averages restart " +
                       "on leaving the pits and in a new session.",
                TextWrapping = TextWrapping.Wrap,
                Margin = RowMargin
            });
            panel.Children.Add(Heading("Shift lights"));
            panel.Children.Add(shifts);
            panel.Children.Add(Heading("Cost"));
            panel.Children.Add(cost);
            AddDiagnostics(panel);
            enabled.Margin = SectionMargin;
            panel.Children.Add(enabled);
            panel.Children.Add(apply);
            state.Margin = new Thickness(0, 12, 0, 0);
            panel.Children.Add(state);
            return panel;
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

        private static TextBlock Wrapped()
        {
            return new TextBlock { TextWrapping = TextWrapping.Wrap };
        }

        private static TextBlock Heading(string text)
        {
            return new TextBlock { Text = text, FontWeight = FontWeights.Bold, Margin = SectionMargin };
        }

        private static UIElement Row(string label, FrameworkElement field)
        {
            field.Width = 220;
            field.HorizontalAlignment = HorizontalAlignment.Left;
            var panel = new StackPanel { Margin = RowMargin };
            panel.Children.Add(new TextBlock { Text = label });
            panel.Children.Add(field);
            return panel;
        }

        private void Apply()
        {
            if (!int.TryParse(port.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) ||
                number < 1024 || number > 65535)
            {
                state.Text = "The port must be a number between 1024 and 65535.";
                return;
            }
            if (!double.TryParse(reserveLaps.Text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture,
                    out var reserve) || reserve < 0 || reserve > MaximumReserveLaps)
            {
                state.Text = "The fuel reserve must be a number of laps between 0 and 10.";
                return;
            }
            if (!int.TryParse(averageLaps.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var laps) ||
                laps < 1 || laps > MaximumAverageLaps)
            {
                state.Text = "The averages must cover between 1 and 10 laps.";
                return;
            }
            plugin.Apply(new PluginSettings
            {
                Port = number,
                Enabled = enabled.IsChecked == true,
                FuelReserveLaps = reserve,
                AverageLaps = laps,
                KnownPorts = plugin.Settings.KnownPorts
            });
            ShowState();
        }

        private void ShowState()
        {
            var hub = plugin.Hub;
            boards.Text = BoardsText(hub);
            configurator.Text = ConfiguratorText(hub.Link);
            shifts.Text = "Shift points come from: " + hub.ShiftSource + ".";
            cost.Text = string.Format(CultureInfo.InvariantCulture,
                "{0:0.000} ms per update, {1} updates a second.", hub.CostMicroseconds / 1000, hub.UpdatesPerSecond);
            if (hub.Error != null) state.Text = "Not listening for the configurator: " + hub.Error;
            else if (!plugin.Settings.Enabled) state.Text = "Sending is switched off.";
            else state.Text = string.Empty;
            ShowDiagnostics();
        }

        partial void AddDiagnostics(StackPanel panel);

        partial void ShowDiagnostics();

        private static string BoardsText(PluginHub hub)
        {
            var lines = hub.Boards.Describe().Select(Describe).ToList();
            lines.AddRange(hub.Boards.BusyPorts().Select(name =>
                name + " — used by another program, perhaps a SimHub Custom Serial device. Remove that device."));
            if (lines.Count > 0) return string.Join(Environment.NewLine, lines);
            return "No Pitrig board found. Connect one by USB. A Guition ESP32-4848S040 is found after the " +
                   "configurator has connected to it once.";
        }

        private static string Describe(BoardStatus board)
        {
            var name = board.Board.Length == 0 ? board.Port : board.Port + " — " + board.Board;
            switch (board.State)
            {
                case BoardState.Streaming:
                    return string.Format(CultureInfo.InvariantCulture, "{0}, firmware {1} — {2} fields, {3:0.0} kB/s",
                        name, board.Firmware, board.Fields, board.BytesPerSecond / 1000);
                case BoardState.SafeMode:
                    return name + " — in safe mode. Open the configurator to repair it.";
                default:
                    return name + " — connecting…";
            }
        }

        private static string ConfiguratorText(ConfiguratorLink link)
        {
            if (!link.IsOpen) return "Not listening.";
            if (link.Target.Length == 0) return "No configurator connected.";
            return string.Format(CultureInfo.InvariantCulture, "Connected to {0} — {1} fields, {2} packets, {3} errors.",
                link.Target, link.FieldCount, link.PacketsSent, link.SendErrors);
        }
    }
}
