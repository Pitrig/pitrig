using System;
using System.Globalization;
using System.Text;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class FieldReader
    {
        public static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

        private const int ValueCapacity = 63;

        private readonly string[] last = new string[TelemetryCatalog.Fields.Length];

        public void Reset()
        {
            Array.Clear(last, 0, last.Length);
        }

        public string Read(PluginManager pluginManager, TelemetryField field)
        {
            var value = field.Computation == FieldComputation.None
                ? Property(pluginManager, field)
                : Computed.Evaluate(pluginManager, field.Computation);
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

        public bool Commit(int index, string text, bool keyframe)
        {
            if (string.Equals(last[index], text, StringComparison.Ordinal))
            {
                return keyframe && text != null;
            }
            last[index] = text;
            return true;
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
                    return Bounded(Convert.ToString(value, Culture).Replace('\r', ' ').Replace('\n', ' '));
                case FieldConversion.TimespanMs:
                    return value is TimeSpan span
                        ? span.TotalMilliseconds.ToString("0", Culture)
                        : null;
                default:
                    return (Convert.ToDouble(value, Culture) * field.Scale).ToString(field.Format, Culture);
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
