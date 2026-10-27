using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Pitrig.SimHub
{
    internal static class Subscription
    {
        private const string DefaultTextBinding = "vehicle.speed";
        private const string LapTimerInput = "session.lap.current_time";
        private const string Modifiers = "\"modifiers\"";
        private const string Controls = "\"controls\"";

        private static readonly string[] ControlInputs = { "input.buttons", "input.switch", "session.time_elapsed" };

        private static readonly Regex Binding =
            new Regex("\"binding\"\\s*:\\s*\"([^\"\\\\]+)\"", RegexOptions.CultureInvariant);

        public static int[] Of(params string[] documents)
        {
            var names = new List<string> { DefaultTextBinding };
            foreach (var document in documents)
            {
                if (string.IsNullOrEmpty(document)) continue;
                foreach (Match match in Binding.Matches(document)) names.Add(match.Groups[1].Value);
                if (document.IndexOf(Modifiers, StringComparison.Ordinal) >= 0) names.Add(LapTimerInput);
                if (document.IndexOf(Controls, StringComparison.Ordinal) >= 0) names.AddRange(ControlInputs);
            }
            return CatalogIndex.OfNames(names);
        }
    }
}
