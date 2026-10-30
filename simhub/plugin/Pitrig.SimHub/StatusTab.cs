using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Windows;
using System.Windows.Controls;
using SimHub.Plugins.Styles;

namespace Pitrig.SimHub
{
    internal sealed class StatusTab
    {
        private readonly PitrigPlugin plugin;
        private readonly SHToggleCheckbox enabled = new SHToggleCheckbox { Content = "Send telemetry to boards" };
        private readonly SHInlineInfo notice = new SHInlineInfo { Margin = PageParts.BlockMargin };
        private readonly StackPanel boards = new StackPanel();
        private readonly StackPanel configurator = new StackPanel();
        private readonly TextBlock shifts = PageParts.Text(string.Empty);
        private string boardsShown;
        private string configuratorShown;

        public StatusTab(PitrigPlugin plugin, Action<Action<PluginSettings>> change)
        {
            this.plugin = plugin;
            enabled.IsChecked = plugin.Settings.Enabled;
            enabled.Click += (sender, arguments) => change(settings => settings.Enabled = enabled.IsChecked == true);
            Content = PageParts.Stack(
                PageParts.Section("TELEMETRY",
                    enabled,
                    PageParts.Caption("Switch it off to leave the boards' ports to other programs."),
                    notice),
                PageParts.Section("BOARDS", boards),
                PageParts.Section("CONFIGURATOR", configurator),
                PageParts.Section("CURRENT CAR", shifts));
        }

        public UIElement Content { get; }

        public void Show()
        {
            var hub = plugin.Hub;
            var on = plugin.Settings.Enabled;
            notice.Text = hub.Error == null ? string.Empty : "Not listening for the configurator: " + hub.Error;
            notice.Visibility = hub.Error == null ? Visibility.Collapsed : Visibility.Visible;
            Replace(boards, ref boardsShown,
                on ? BoardLines(hub) : SwitchedOff("The plugin leaves every port alone until you switch it on."));
            Replace(configurator, ref configuratorShown, on ? ConfiguratorLines(hub.Link) : SwitchedOff(null));
            shifts.Text = "Shift points come from: " + hub.ShiftSource + ".";
        }

        private static List<StatusLine> SwitchedOff(string detail)
        {
            return new List<StatusLine> { new StatusLine(Tone.Idle, "Switched off", detail) };
        }

        private static List<StatusLine> BoardLines(PluginHub hub)
        {
            var described = hub.Boards.Describe();
            var lines = described.Select(Describe).ToList();
            var fed = new HashSet<string>(described.Select(board => board.Port), StringComparer.OrdinalIgnoreCase);
            lines.AddRange(hub.Link.HeldPorts().Where(port => !fed.Contains(port)).Select(port =>
                new StatusLine(Tone.Elsewhere, port, "In the Pitrig configurator, which passes this telemetry on.")));
            lines.AddRange(hub.Boards.BusyPorts().Select(port => new StatusLine(Tone.Problem, port,
                "Used by another program, perhaps a SimHub Custom Serial device. Remove that device.")));
            if (lines.Count > 0) return lines;
            lines.Add(new StatusLine(Tone.Idle, "No Pitrig board found",
                "Connect one by USB. A Guition ESP32-4848S040 is found after the configurator has connected to it once."));
            return lines;
        }

        private static StatusLine Describe(BoardStatus board)
        {
            var name = board.Board.Length == 0 ? board.Port : board.Board + " · " + board.Port;
            switch (board.State)
            {
                case BoardState.Streaming:
                    return new StatusLine(Tone.Good, name, string.Format(CultureInfo.InvariantCulture,
                        "Connected · firmware {0} · {1} values · {2:0.0} kB/s", board.Firmware, board.Fields,
                        board.BytesPerSecond / 1000));
                case BoardState.SafeMode:
                    return new StatusLine(Tone.Problem, name, "In safe mode. Open the configurator to repair it.", true);
                default:
                    return new StatusLine(Tone.Waiting, name, "Connecting…");
            }
        }

        private static List<StatusLine> ConfiguratorLines(ConfiguratorLink link)
        {
            var target = link.Target;
            StatusLine line;
            if (!link.IsOpen) line = new StatusLine(Tone.Problem, "Not listening", "The configurator cannot reach the plugin.");
            else if (target.Length == 0) line = new StatusLine(Tone.Idle, "Not connected",
                "Open it to change what a board shows. It takes the board over while it runs.", true);
            else line = new StatusLine(Tone.Good, "Connected", Sending(target, link.FieldCount));
            return new List<StatusLine> { line };
        }

        private static string Sending(string target, int fields)
        {
            var values = fields == 0
                ? "Nothing to send yet"
                : string.Format(CultureInfo.InvariantCulture, "Sending {0} values", fields);
            var colon = target.LastIndexOf(':');
            var local = colon > 0 && IPAddress.TryParse(target.Substring(0, colon), out var address) &&
                        IPAddress.IsLoopback(address);
            return local || colon <= 0 ? values : values + " to " + target.Substring(0, colon);
        }

        private static void Replace(Panel panel, ref string shown, List<StatusLine> lines)
        {
            var signature = string.Join("\n", lines);
            if (signature == shown) return;
            shown = signature;
            panel.Children.Clear();
            foreach (var line in lines) panel.Children.Add(line.Build());
        }

        private sealed class StatusLine
        {
            private readonly Tone tone;
            private readonly string title;
            private readonly string detail;
            private readonly bool configurator;

            public StatusLine(Tone tone, string title, string detail, bool configurator = false)
            {
                this.tone = tone;
                this.title = title;
                this.detail = detail;
                this.configurator = configurator;
            }

            public FrameworkElement Build()
            {
                return PageParts.Row(tone, title, detail, configurator ? PageParts.ConfiguratorButton() : null);
            }

            public override string ToString()
            {
                return tone + "|" + title + "|" + detail + "|" + configurator;
            }
        }
    }
}
