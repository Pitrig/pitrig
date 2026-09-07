using System;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace Pitrig.SimHub
{
    internal sealed class SettingsControl : UserControl
    {
        private static readonly Thickness RowMargin = new Thickness(0, 4, 0, 0);

        private readonly PitrigPlugin plugin;
        private readonly TextBox host = new TextBox();
        private readonly TextBox port = new TextBox();
        private readonly CheckBox enabled = new CheckBox { Content = "Send telemetry" };
        private readonly TextBlock state = new TextBlock { TextWrapping = TextWrapping.Wrap };
        private readonly DispatcherTimer refresh = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(500)
        };

        public SettingsControl(PitrigPlugin plugin)
        {
            this.plugin = plugin;
            host.Text = plugin.Settings.Host;
            port.Text = plugin.Settings.Port.ToString(CultureInfo.InvariantCulture);
            enabled.IsChecked = plugin.Settings.Enabled;
            Content = Layout();
            refresh.Tick += (sender, arguments) => ShowState();
            Loaded += (sender, arguments) => refresh.Start();
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
                Text = "The Pitrig configurator listens for this stream and forwards it to the board.",
                TextWrapping = TextWrapping.Wrap
            });
            panel.Children.Add(Row("Configurator host", host));
            panel.Children.Add(Row("Port", port));
            enabled.Margin = RowMargin;
            panel.Children.Add(enabled);
            panel.Children.Add(apply);
            state.Margin = new Thickness(0, 12, 0, 0);
            panel.Children.Add(state);
            return panel;
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
            plugin.Apply(new PluginSettings
            {
                Host = host.Text.Trim(),
                Port = number,
                Enabled = enabled.IsChecked == true
            });
            ShowState();
        }

        private void ShowState()
        {
            if (plugin.Error != null)
            {
                state.Text = "Not sending: " + plugin.Error;
                return;
            }
            if (!plugin.Settings.Enabled)
            {
                state.Text = "Sending is switched off.";
                return;
            }
            state.Text = string.Format(
                CultureInfo.InvariantCulture,
                "Sending to {0} — {1} packets, {2} values, {3} errors.",
                plugin.Target,
                plugin.PacketsSent,
                plugin.LinesSent,
                plugin.SendErrors);
        }
    }
}
