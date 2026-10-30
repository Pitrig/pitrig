using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace Pitrig.SimHub
{
    internal sealed class InputState
    {
        public const int ButtonCount = 16;
        public const int PositionCount = 12;
        public const string ButtonAction = "Button";
        public const string PositionAction = "SwitchPosition";

        private const long MinimumPressMs = 60;
        private const long StalePressMs = 250;
        private const int ReportBudget = 1000;
        private const string TraceSource = "inputs";

        private static readonly string ActionPrefix = nameof(PitrigPlugin) + ".";

        private readonly object gate = new object();
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly HashSet<string> pressed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, InputMapping> mappings =
            new Dictionary<string, InputMapping>(StringComparer.OrdinalIgnoreCase);
        private volatile Action<string> listener;
        private uint actions;
        private uint latched;
        private long latchedAt;
        private int position;
        private string lastInput = string.Empty;
        private uint lastButtons;
        private int lastPosition;
        private long lastAt;

        public int Position
        {
            get
            {
                lock (gate) return position;
            }
        }

        public void Listen(Action<string> report)
        {
            listener = report;
        }

        public uint TakeButtons()
        {
            lock (gate)
            {
                var age = clock.ElapsedMilliseconds - latchedAt;
                var buttons = actions | Physical() | (age <= StalePressMs ? latched : 0);
                if (age >= MinimumPressMs) latched = 0;
                return buttons;
            }
        }

        public void Action(int button, bool down)
        {
            if (button < 0 || button >= ButtonCount) return;
            var bit = 1u << button;
            lock (gate)
            {
                if (!down)
                {
                    actions &= ~bit;
                }
                else
                {
                    Latch(bit);
                    if (pressed.Count > 0) actions |= bit;
                    Remember(ActionPrefix + ButtonAction + (button + 1).ToString(CultureInfo.InvariantCulture), bit, 0);
                }
                Report("action=" + (button + 1).ToString(CultureInfo.InvariantCulture), down);
            }
        }

        public void Select(int selected)
        {
            if (selected < 1 || selected > PositionCount) return;
            lock (gate)
            {
                position = selected;
                Remember(ActionPrefix + PositionAction + selected.ToString(CultureInfo.InvariantCulture), 0, selected);
                Report(null, true);
            }
        }

        public void Changed(string input, bool down)
        {
            if (string.IsNullOrEmpty(input)) return;
            lock (gate)
            {
                if (down)
                {
                    pressed.Add(input);
                    var buttons = ButtonsOf(input);
                    var selected = PositionOf(input);
                    Latch(buttons);
                    if (selected > 0) position = selected;
                    Remember(input, buttons, selected);
                }
                else
                {
                    pressed.Remove(input);
                    if (pressed.Count == 0) actions = 0;
                }
                Report("input=" + input, down);
            }
            PluginTrace.Event(TraceSource, input + (down ? " down" : " up"));
        }

        public void Map(string board, InputMapping mapping)
        {
            lock (gate) mappings[board] = mapping;
        }

        public void Forget(string board)
        {
            lock (gate) mappings.Remove(board);
        }

        public InputSnapshot Snapshot()
        {
            lock (gate)
            {
                var names = new string[ButtonCount];
                var wired = false;
                foreach (var mapping in mappings.Values)
                {
                    wired |= mapping.Buttons.Count > 0 || mapping.Positions.Count > 0;
                    foreach (var pair in mapping.Names)
                    {
                        if (names[pair.Key - 1] == null) names[pair.Key - 1] = pair.Value;
                    }
                }
                return new InputSnapshot
                {
                    Held = actions | Physical(),
                    Position = position,
                    Names = names,
                    Wired = wired,
                    LastInput = lastInput,
                    LastButtons = lastButtons,
                    LastPosition = lastPosition,
                    LastAgeMs = clock.ElapsedMilliseconds - lastAt
                };
            }
        }

        private void Remember(string input, uint buttons, int selected)
        {
            lastInput = input;
            lastButtons = buttons;
            lastPosition = selected;
            lastAt = clock.ElapsedMilliseconds;
        }

        private void Latch(uint bits)
        {
            if (bits == 0) return;
            latched |= bits;
            latchedAt = clock.ElapsedMilliseconds;
        }

        private void Report(string change, bool down)
        {
            var report = listener;
            if (report == null) return;
            var text = new StringBuilder();
            if (change != null) text.Append(change).Append("\ndown=").Append(down ? '1' : '0').Append('\n');
            text.Append("actions=").Append(actions.ToString(CultureInfo.InvariantCulture))
                .Append("\nbuttons=").Append((actions | Physical()).ToString(CultureInfo.InvariantCulture))
                .Append("\nswitch=").Append(position.ToString(CultureInfo.InvariantCulture)).Append('\n');
            foreach (var name in pressed)
            {
                if (text.Length + name.Length > ReportBudget) break;
                text.Append("pressed=").Append(name).Append('\n');
            }
            report(text.ToString());
        }

        private uint Physical()
        {
            uint mask = 0;
            foreach (var input in pressed) mask |= ButtonsOf(input);
            return mask;
        }

        private uint ButtonsOf(string input)
        {
            uint mask = 0;
            foreach (var mapping in mappings.Values)
            {
                if (mapping.Buttons.TryGetValue(input, out var bits)) mask |= bits;
            }
            return mask;
        }

        private int PositionOf(string input)
        {
            foreach (var mapping in mappings.Values)
            {
                if (mapping.Positions.TryGetValue(input, out var selected)) return selected;
            }
            return 0;
        }
    }

    internal sealed class InputSnapshot
    {
        public uint Held { get; set; }

        public int Position { get; set; }

        public string[] Names { get; set; }

        public bool Wired { get; set; }

        public string LastInput { get; set; }

        public uint LastButtons { get; set; }

        public int LastPosition { get; set; }

        public long LastAgeMs { get; set; }
    }
}
