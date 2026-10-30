using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace Pitrig.SimHub
{
    internal sealed class InputMapping
    {
        private const string Section = "\"inputs\"";

        public static readonly InputMapping Empty = new InputMapping();

        private InputMapping()
        {
        }

        public Dictionary<string, uint> Buttons { get; } = new Dictionary<string, uint>(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, int> Positions { get; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        public Dictionary<int, string> Names { get; } = new Dictionary<int, string>();

        public static InputMapping Of(IEnumerable<KeyValuePair<int, string>> buttons,
            IEnumerable<KeyValuePair<int, string>> positions)
        {
            var mapping = new InputMapping();
            foreach (var pair in buttons) mapping.Press(pair.Key, pair.Value);
            foreach (var pair in positions) mapping.Place(pair.Key, pair.Value);
            return mapping;
        }

        public static InputMapping Parse(string modules)
        {
            if (string.IsNullOrEmpty(modules) || modules.IndexOf(Section, StringComparison.Ordinal) < 0) return Empty;
            try
            {
                var root = new JavaScriptSerializer().DeserializeObject(modules) as Dictionary<string, object>;
                if (root == null || !root.TryGetValue("inputs", out var section)) return Empty;
                var inputs = section as Dictionary<string, object>;
                if (inputs == null) return Empty;
                var mapping = new InputMapping();
                var buttons = Items(inputs, "buttons");
                for (var button = 0; button < buttons.Length; button += 1)
                {
                    var entry = buttons[button] as Dictionary<string, object>;
                    mapping.Name(button + 1, entry);
                    foreach (var id in Ids(entry, "sources")) mapping.Press(button + 1, id);
                }
                var positions = Ids(inputs.TryGetValue("switch", out var control) ? control as Dictionary<string, object> : null,
                    "positions");
                for (var position = 0; position < positions.Count; position += 1) mapping.Place(position + 1, positions[position]);
                return mapping;
            }
            catch (Exception exception) when (exception is ArgumentException || exception is InvalidOperationException)
            {
                return Empty;
            }
        }

        private void Press(int button, string id)
        {
            if (button < 1 || button > InputState.ButtonCount || string.IsNullOrEmpty(id)) return;
            Buttons.TryGetValue(id, out var bits);
            Buttons[id] = bits | (1u << (button - 1));
        }

        private void Name(int button, Dictionary<string, object> entry)
        {
            if (button > InputState.ButtonCount || entry == null) return;
            if (entry.TryGetValue("name", out var name) && name is string text && text.Length > 0) Names[button] = text;
        }

        private void Place(int position, string id)
        {
            if (position < 1 || position > InputState.PositionCount || string.IsNullOrEmpty(id)) return;
            if (!Positions.ContainsKey(id)) Positions[id] = position;
        }

        private static object[] Items(Dictionary<string, object> parent, string key)
        {
            return parent != null && parent.TryGetValue(key, out var value) && value is object[] items ? items : new object[0];
        }

        private static List<string> Ids(Dictionary<string, object> parent, string key)
        {
            var ids = new List<string>();
            foreach (var item in Items(parent, key))
            {
                if (item is Dictionary<string, object> entry && entry.TryGetValue("id", out var id) && id is string text &&
                    text.Length > 0)
                {
                    ids.Add(text);
                }
            }
            return ids;
        }
    }
}
