using System;
using System.Globalization;
using System.Text;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal static class FieldReader
    {
        public static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

        private const int ValueCapacity = 63;

        public static string Read(TelemetryState state, TelemetryField field)
        {
            var value = field.Computation == FieldComputation.None
                ? Property(state.Manager, field)
                : Computed.Evaluate(state, field.Computation);
            if (value == null) return field.Fallback;
            try
            {
                return Format(field, value) ?? field.Fallback;
            }
            catch (Exception exception) when (exception is FormatException ||
                                              exception is InvalidCastException ||
                                              exception is OverflowException)
            {
                return field.Fallback;
            }
        }

        private static object Property(PluginManager pluginManager, TelemetryField field)
        {
            var value = pluginManager.GetPropertyValue(field.Property);
            if (value != null || field.PropertyFallback == null) return value;
            return pluginManager.GetPropertyValue(field.PropertyFallback);
        }

        private static string Format(TelemetryField field, object value)
        {
            switch (field.Conversion)
            {
                case FieldConversion.Boolean:
                    return Convert.ToBoolean(value) ? "1" : "0";
                case FieldConversion.Text:
                    var text = Convert.ToString(value, Culture).Replace('\r', ' ').Replace('\n', ' ');
                    return text.Length == 0 ? null : Bounded(text);
                case FieldConversion.TimespanMs:
                    return value is TimeSpan span && span.TotalMilliseconds <= uint.MaxValue
                        ? Number(field, span.TotalMilliseconds, "0")
                        : null;
                default:
                    return Number(field, Convert.ToDouble(value, Culture) * field.Scale, field.Format);
            }
        }

        private static string Number(TelemetryField field, double number, string format)
        {
            return Unavailable(field, number) ? null : number.ToString(format, Culture);
        }

        private static bool Unavailable(TelemetryField field, double number)
        {
            switch (field.UnavailableWhen)
            {
                case FieldComparison.Below:
                    return number < field.UnavailableValue;
                case FieldComparison.AtOrBelow:
                    return number <= field.UnavailableValue;
                default:
                    return false;
            }
        }

        private static string Bounded(string text)
        {
            if (Encoding.UTF8.GetByteCount(text) <= ValueCapacity) return text;
            var count = Math.Min(text.Length, ValueCapacity);
            while (count > 0 && (char.IsHighSurrogate(text[count - 1]) ||
                                 Encoding.UTF8.GetByteCount(text.Substring(0, count)) > ValueCapacity))
            {
                count -= 1;
            }
            return text.Substring(0, count);
        }
    }
}
