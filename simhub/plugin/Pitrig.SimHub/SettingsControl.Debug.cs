using System;
using System.Linq;
using System.Windows.Controls;

namespace Pitrig.SimHub
{
    internal sealed partial class SettingsControl
    {
        private readonly TextBlock diagnostics = Wrapped();

        partial void AddDiagnostics(StackPanel panel)
        {
            panel.Children.Add(Heading("Diagnostics, development build"));
            panel.Children.Add(diagnostics);
        }

        partial void ShowDiagnostics()
        {
            var lines = PluginTrace.Describe().Concat(new[] { "Trace log: " + PluginTrace.LogPath });
            diagnostics.Text = string.Join(Environment.NewLine, lines);
        }
    }
}
