namespace Pitrig.SimHub
{
    public class PluginSettings
    {
        public int Port { get; set; } = TelemetryCatalog.LinkSourcePort;

        public bool Enabled { get; set; } = true;

        public double FuelReserveLaps { get; set; } = TelemetryCatalog.ParameterFuelReserveLaps;

        public int AverageLaps { get; set; } = (int)TelemetryCatalog.ParameterAverageLaps;
    }
}
