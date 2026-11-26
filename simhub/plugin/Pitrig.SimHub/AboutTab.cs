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
        private const string Contact = Website + "/contact";
        private const string Email = "contact.pitrig@gmail.com";
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
                        Text = UiText.AboutTitle,
                        FontSize = TitleSize,
                        FontWeight = FontWeights.SemiBold,
                        Margin = PageParts.BlockMargin
                    },
                    PageParts.Caption(UiText.AboutVersion(version)),
                    PageParts.Text(UiText.AboutIntro)),
                PageParts.Section(UiText.AboutUpdates, PageParts.Text(UiText.AboutUpdatesText), configurator),
                PageParts.Section(UiText.AboutLinks,
                    PageParts.Link(UiText.AboutWebsite, Website),
                    PageParts.Link(UiText.AboutGuides, Guides),
                    PageParts.Link(UiText.AboutSourceCode, Repository),
                    PageParts.Link(UiText.AboutReportProblem, Issues)),
                PageParts.Section(UiText.AboutContact,
                    PageParts.Text(UiText.AboutContactText),
                    PageParts.Link(UiText.AboutContactForm, Contact),
                    PageParts.Link(Email, "mailto:" + Email)),
                PageParts.Section(UiText.AboutStatistics, PageParts.Text(UiText.AboutStatisticsText)),
                PageParts.Section(UiText.AboutLicense,
                    PageParts.Text(UiText.AboutLicenseText),
                    PageParts.Link(UiText.AboutReadLicense, License)),
                PageParts.Section(UiText.AboutTechnical, technical));
        }

        public UIElement Content { get; }

        public void Show()
        {
            var link = hub.Link;
            technical.Text = UiText.AboutTechnicalText(
                cost: (hub.CostMicroseconds / 1000).ToString("0.000", CultureInfo.InvariantCulture),
                rate: hub.UpdatesPerSecond,
                packets: link.PacketsSent,
                errors: link.SendErrors);
        }
    }
}
