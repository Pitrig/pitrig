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
        private readonly SHToggleCheckbox enabled = new SHToggleCheckbox { Content = UiText.StatusSendTelemetry };
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
                PageParts.Section(UiText.StatusTelemetry,
                    enabled,
                    PageParts.Caption(UiText.StatusSwitchOffHint),
                    notice),
                PageParts.Section(UiText.StatusBoards, boards),
                PageParts.Section(UiText.StatusConfigurator, configurator),
                PageParts.Section(UiText.StatusCurrentCar, shifts));
        }

        public UIElement Content { get; }

        public void Show()
        {
            var hub = plugin.Hub;
            var on = plugin.Settings.Enabled;
            notice.Text = hub.Error == null ? string.Empty : UiText.StatusNotListeningFor(hub.Error);
            notice.Visibility = hub.Error == null ? Visibility.Collapsed : Visibility.Visible;
            Replace(boards, ref boardsShown, on ? BoardLines(hub) : SwitchedOff(UiText.StatusLeavesPortsAlone));
            Replace(configurator, ref configuratorShown, on ? ConfiguratorLines(hub.Link) : SwitchedOff(null));
            shifts.Text = UiText.StatusShiftSource(hub.ShiftSource);
        }

        private static List<StatusLine> SwitchedOff(string detail)
        {
            return new List<StatusLine> { new StatusLine(Tone.Idle, UiText.StatusSwitchedOff, detail) };
        }

        private static List<StatusLine> BoardLines(PluginHub hub)
        {
            var described = hub.Boards.Describe();
            var lines = described.Select(Describe).ToList();
            var fed = new HashSet<string>(described.Select(board => board.Port), StringComparer.OrdinalIgnoreCase);
            lines.AddRange(hub.Link.HeldPorts().Where(port => !fed.Contains(port)).Select(port =>
                new StatusLine(Tone.Elsewhere, port, UiText.StatusInConfigurator)));
            lines.AddRange(hub.Boards.BusyPorts().Select(port => new StatusLine(Tone.Problem, port, UiText.StatusPortBusy)));
            if (lines.Count > 0) return lines;
            lines.Add(new StatusLine(Tone.Idle, UiText.StatusNoBoard, UiText.StatusNoBoardHint));
            return lines;
        }

        private static StatusLine Describe(BoardStatus board)
        {
            var name = board.Board.Length == 0 ? board.Port : board.Board + " · " + board.Port;
            switch (board.State)
            {
                case BoardState.Streaming:
                    return new StatusLine(Tone.Good, name, UiText.StatusStreaming(
                        firmware: board.Firmware,
                        values: board.Fields,
                        speed: (board.BytesPerSecond / 1000).ToString("0.0", CultureInfo.InvariantCulture)));
                case BoardState.SafeMode:
                    return new StatusLine(Tone.Problem, name, UiText.StatusSafeMode, true);
                default:
                    return new StatusLine(Tone.Waiting, name, UiText.StatusConnecting);
            }
        }

        private static List<StatusLine> ConfiguratorLines(ConfiguratorLink link)
        {
            var target = link.Target;
            StatusLine line;
            if (!link.IsOpen) line = new StatusLine(Tone.Problem, UiText.StatusNotListening, UiText.StatusCannotReach);
            else if (target.Length == 0) line = new StatusLine(Tone.Idle, UiText.StatusNotConnected, UiText.StatusOpenToChange, true);
            else line = new StatusLine(Tone.Good, UiText.StatusConnected, Sending(target, link.FieldCount));
            return new List<StatusLine> { line };
        }

        private static string Sending(string target, int fields)
        {
            var colon = target.LastIndexOf(':');
            var local = colon > 0 && IPAddress.TryParse(target.Substring(0, colon), out var address) &&
                        IPAddress.IsLoopback(address);
            var host = local || colon <= 0 ? null : target.Substring(0, colon);
            if (fields == 0) return host == null ? UiText.StatusNothingToSend : UiText.StatusNothingToSendTo(host);
            return host == null ? UiText.StatusSending(fields) : UiText.StatusSendingTo(count: fields, host: host);
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
