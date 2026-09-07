namespace Pitrig.SimHub
{
    public class PluginSettings
    {
        public string Host { get; set; } = "127.0.0.1";

        public int Port { get; set; } = TelemetryCatalog.LinkDefaultPort;

        public bool Enabled { get; set; } = true;
    }
}
