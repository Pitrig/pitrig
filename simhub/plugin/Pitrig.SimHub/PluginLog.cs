namespace Pitrig.SimHub
{
    internal static class PluginLog
    {
        private const string Prefix = "Pitrig: ";

        public static void Info(string message)
        {
            global::SimHub.Logging.Current.Info(Prefix + message);
        }

        public static void Warn(string message)
        {
            global::SimHub.Logging.Current.Warn(Prefix + message);
        }
    }
}
