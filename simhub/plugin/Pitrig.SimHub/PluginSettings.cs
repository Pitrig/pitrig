using System.Collections.Generic;

namespace Pitrig.SimHub
{
    public class PluginSettings
    {
        public int Port { get; set; } = TelemetryCatalog.LinkSourcePort;

        public bool Enabled { get; set; } = true;

        public double FuelMargin { get; set; } = TelemetryCatalog.ParameterFuelMargin;

        public int AverageLaps { get; set; } = (int)TelemetryCatalog.ParameterAverageLaps;

        public List<KnownPort> KnownPorts { get; set; } = new List<KnownPort>();
    }

    public class KnownPort
    {
        public string Name { get; set; }

        public int BaudRate { get; set; }
    }
}
