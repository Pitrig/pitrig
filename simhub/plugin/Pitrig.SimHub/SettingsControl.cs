using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using SimHub.Plugins.Styles;

namespace Pitrig.SimHub
{
    internal sealed partial class SettingsControl : UserControl
    {
        private static readonly TimeSpan PageRefresh = TimeSpan.FromMilliseconds(500);
        private static readonly TimeSpan ButtonsRefresh = TimeSpan.FromMilliseconds(100);
        private static readonly TimeSpan SaveDelay = TimeSpan.FromSeconds(1);

        private readonly PitrigPlugin plugin;
        private readonly SHTabControl tabs = new SHTabControl();
        private readonly Dictionary<TabItem, Action> shows = new Dictionary<TabItem, Action>();
        private readonly TabItem buttonsTab;
        private readonly DispatcherTimer refresh = new DispatcherTimer { Interval = PageRefresh };
        private readonly DispatcherTimer save = new DispatcherTimer { Interval = SaveDelay };

        public SettingsControl(PitrigPlugin plugin)
        {
            this.plugin = plugin;
            var status = new StatusTab(plugin, Change);
            var buttons = new ButtonsTab(plugin.Hub.Inputs);
            var about = new AboutTab(plugin.Hub);
            Add("Status", status.Content, status.Show);
            Add("Settings", new SettingsTab(plugin, Change).Content, null);
            buttonsTab = Add("Buttons", buttons.Content, buttons.Show);
            Add("About", about.Content, about.Show);
            AddDiagnostics();
            tabs.SelectedIndex = 0;
            tabs.SelectionChanged += (sender, arguments) =>
            {
                if (!ReferenceEquals(arguments.OriginalSource, tabs)) return;
                refresh.Interval = ReferenceEquals(tabs.SelectedItem, buttonsTab) ? ButtonsRefresh : PageRefresh;
                Show();
            };
            Content = tabs;
            refresh.Tick += (sender, arguments) => Show();
            save.Tick += (sender, arguments) => Save();
            Loaded += (sender, arguments) =>
            {
                refresh.Start();
                Show();
            };
            Unloaded += (sender, arguments) =>
            {
                refresh.Stop();
                if (save.IsEnabled) Save();
            };
        }

        partial void AddDiagnostics();

        private TabItem Add(string header, UIElement content, Action show)
        {
            var tab = PageParts.Tab(header, content);
            tabs.Items.Add(tab);
            if (show != null) shows[tab] = show;
            return tab;
        }

        private void Change(Action<PluginSettings> change)
        {
            var next = plugin.Settings.Copy();
            change(next);
            plugin.Apply(next);
            save.Stop();
            save.Start();
            Show();
        }

        private void Save()
        {
            save.Stop();
            plugin.SaveSettings();
        }

        private void Show()
        {
            if (tabs.SelectedItem is TabItem tab && shows.TryGetValue(tab, out var show)) show();
        }
    }
}
