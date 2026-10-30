using System;
using System.Linq;

namespace Pitrig.SimHub
{
    internal sealed partial class SettingsControl
    {
        partial void AddDiagnostics()
        {
            var diagnostics = PageParts.Text(string.Empty);
            Add("Diagnostics", PageParts.Section("DEVELOPMENT BUILD", diagnostics), () =>
            {
                var lines = PluginTrace.Describe().Concat(new[] { "Trace log: " + PluginTrace.LogPath });
                diagnostics.Text = string.Join(Environment.NewLine, lines);
            });
        }
    }
}
