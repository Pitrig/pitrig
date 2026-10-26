using System.Diagnostics;

namespace Pitrig.SimHub
{
    internal static partial class PluginTrace
    {
        [Conditional("PITRIG_DEBUG")]
        public static void Event(string source, string message)
        {
            OnEvent(source, message);
        }

        [Conditional("PITRIG_DEBUG")]
        public static void State(string source, string state)
        {
            OnState(source, state);
        }

        [Conditional("PITRIG_DEBUG")]
        public static void Request(string source, string command, double milliseconds, int busyRetries,
            string outcome)
        {
            OnRequest(source, command, milliseconds, busyRetries, outcome);
        }

        [Conditional("PITRIG_DEBUG")]
        public static void Write(string source, int bytes, double milliseconds)
        {
            OnWrite(source, bytes, milliseconds);
        }

        [Conditional("PITRIG_DEBUG")]
        public static void Update(double now, double costMicroseconds)
        {
            OnUpdate(now, costMicroseconds);
        }

        static partial void OnEvent(string source, string message);

        static partial void OnState(string source, string state);

        static partial void OnRequest(string source, string command, double milliseconds, int busyRetries,
            string outcome);

        static partial void OnWrite(string source, int bytes, double milliseconds);

        static partial void OnUpdate(double now, double costMicroseconds);
    }
}
