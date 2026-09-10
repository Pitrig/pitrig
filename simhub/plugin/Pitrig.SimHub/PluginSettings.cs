namespace Pitrig.SimHub
{
    public class PluginSettings
    {
        public int Port { get; set; } = TelemetryCatalog.LinkSourcePort;

        public bool Enabled { get; set; } = true;
    }
}
