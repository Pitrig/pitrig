using System.Globalization;
using System.Windows;
using System.Windows.Controls;

namespace Pitrig.SimHub
{
    internal sealed class AboutTab
    {
        private const string Website = "https://www.pitrig.com";
        private const string Guides = Website + "/docs";
        private const string Repository = "https://github.com/Pitrig/pitrig";
        private const string Issues = Repository + "/issues";
        private const string License = "https://www.apache.org/licenses/LICENSE-2.0";
        private const double WordmarkHeight = 44;
        private const double TitleSize = 16;

        private readonly PluginHub hub;
        private readonly TextBlock technical = PageParts.Caption(string.Empty);

        public AboutTab(PluginHub hub)
        {
            this.hub = hub;
            var version = typeof(PitrigPlugin).Assembly.GetName().Version.ToString(3);
            var configurator = PageParts.ConfiguratorButton();
            configurator.Margin = PageParts.BlockMargin;
            var wordmark = Artwork.Wordmark(WordmarkHeight);
            wordmark.Margin = PageParts.BlockMargin;
            Content = PageParts.Stack(
                PageParts.Indented(
                    wordmark,
                    new TextBlock
                    {
                        Text = "Pitrig telemetry for SimHub",
                        FontSize = TitleSize,
                        FontWeight = FontWeights.SemiBold,
                        Margin = PageParts.BlockMargin
                    },
                    PageParts.Caption("Version " + version),
                    PageParts.Text(
                        "Pitrig finds its boards by itself and sends each one the telemetry its dashboard uses. While " +
                        "the Pitrig configurator is connected to a board it takes the board over and passes this " +
                        "telemetry on, and the board comes back here when it lets go.")),
                PageParts.Section("UPDATES",
                    PageParts.Text("Updates come with the Pitrig configurator: it checks for a new version and replaces " +
                                   "this plugin in SimHub."),
                    configurator),
                PageParts.Section("LINKS",
                    PageParts.Link("Website", Website),
                    PageParts.Link("Guides", Guides),
                    PageParts.Link("Source code", Repository),
                    PageParts.Link("Report a problem", Issues)),
                PageParts.Section("LICENSE",
                    PageParts.Text("The plugin is open source under the Apache License 2.0."),
                    PageParts.Link("Read the license", License)),
                PageParts.Section("TECHNICAL", technical));
        }

        public UIElement Content { get; }

        public void Show()
        {
            var link = hub.Link;
            technical.Text = string.Format(CultureInfo.InvariantCulture,
                "{0:0.000} ms per update, {1} updates a second. Configurator link: {2} packets, {3} errors.",
                hub.CostMicroseconds / 1000, hub.UpdatesPerSecond, link.PacketsSent, link.SendErrors);
        }
    }
}
