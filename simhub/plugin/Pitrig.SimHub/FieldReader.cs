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
        private const double SecondsPerMinute = 60;

        public static string Read(TelemetryState state, TelemetryField field)
        {
            var source = SourceOf(field, state.GameName);
            object value;
            try
            {
                value = source != null
                    ? state.Status == null ? null : GameValue(state.Manager, source)
                    : field.Computation == FieldComputation.None
                        ? Property(state.Manager, field)
                        : Computed.Evaluate(state, field.Computation);
            }
            catch (Exception exception) when (exception is FormatException ||
                                              exception is InvalidCastException ||
                                              exception is OverflowException)
            {
                return field.Fallback;
            }
            if (value == null) return field.Fallback;
            try
            {
                return Format(field, value, source == null ? field.Scale : 1) ?? field.Fallback;
            }
            catch (Exception exception) when (exception is FormatException ||
                                              exception is InvalidCastException ||
                                              exception is OverflowException)
            {
                return field.Fallback;
            }
        }

        private static GameSource SourceOf(TelemetryField field, string game)
        {
            if (field.Games == null || game == null) return null;
            foreach (var source in field.Games)
            {
                if (string.Equals(source.Game, game, StringComparison.Ordinal)) return source;
            }
            return null;
        }

        private static object GameValue(PluginManager pluginManager, GameSource source)
        {
            var raw = pluginManager.GetPropertyValue(source.Property);
            if (raw == null) return null;
            if (source.Bit >= 0) return (((long)Convert.ToDouble(raw, Culture) >> source.Bit) & 1) == 1;
            if (source.Values != null) return source.Values.TryGetValue(Key(raw), out var mapped) ? mapped : source.Fallback;
            if (source.Clock) return Clock(Convert.ToDouble(raw, Culture));
            return source.Scale == 1 ? raw : (object)(Convert.ToDouble(raw, Culture) * source.Scale);
        }

        private static string Key(object raw)
        {
            if (raw is bool flag) return flag ? "1" : "0";
            if (raw is string text) return text;
            return Convert.ToDouble(raw, Culture).ToString("R", Culture);
        }

        private static string Clock(double seconds)
        {
            if (!(seconds >= 0) || double.IsInfinity(seconds)) return null;
            var minutes = (long)(seconds / SecondsPerMinute);
            return string.Format(Culture, "{0:00}:{1:00}", minutes / 60 % 24, minutes % 60);
        }

        private static object Property(PluginManager pluginManager, TelemetryField field)
        {
            if (field.Property == null) return null;
            var value = pluginManager.GetPropertyValue(field.Property);
            if (value != null || field.PropertyFallback == null) return value;
            return pluginManager.GetPropertyValue(field.PropertyFallback);
        }

        private static string Format(TelemetryField field, object value, double scale)
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
                    return Number(field, Convert.ToDouble(value, Culture) * scale, field.Format);
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
