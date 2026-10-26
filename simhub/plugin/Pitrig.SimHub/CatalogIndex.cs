using System;
using System.Collections.Generic;
using System.Linq;

namespace Pitrig.SimHub
{
    internal static class CatalogIndex
    {
        private const string Everything = "*";

        public static readonly int[] All = Enumerable.Range(0, TelemetryCatalog.Fields.Length).ToArray();

        private static readonly Dictionary<string, int> ByName = Build(field => field.Name);
        private static readonly Dictionary<string, int> ByWireId = Build(field => field.WireId);

        public static int[] OfNames(IEnumerable<string> names)
        {
            return Resolve(names, ByName);
        }

        public static int[] OfWireIds(string list)
        {
            var trimmed = list.Trim();
            if (trimmed == Everything) return All;
            return Resolve(trimmed.Split(','), ByWireId);
        }

        public static string WireIds(int[] indices)
        {
            return string.Join(",", indices.Select(index => TelemetryCatalog.Fields[index].WireId));
        }

        private static int[] Resolve(IEnumerable<string> keys, Dictionary<string, int> map)
        {
            var indices = new SortedSet<int>();
            foreach (var key in keys)
            {
                if (key != null && map.TryGetValue(key.Trim(), out var index)) indices.Add(index);
            }
            return indices.ToArray();
        }

        private static Dictionary<string, int> Build(Func<TelemetryField, string> key)
        {
            var map = new Dictionary<string, int>(StringComparer.Ordinal);
            var fields = TelemetryCatalog.Fields;
            for (var index = 0; index < fields.Length; index += 1) map[key(fields[index])] = index;
            return map;
        }
    }
}
