using System.Collections.Generic;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Media;

namespace Pitrig.SimHub
{
    internal sealed class ButtonsTab
    {
        private const int Columns = 8;
        private const long RecentPressMs = 300;
        private const double TileHeight = 56;
        private const double GridMaxWidth = 680;
        private const double NumberSize = 16;
        private const double NameSize = 11;

        private const string Wiring =
            "Buttons are wired on the Buttons page of the Pitrig configurator, or in SimHub under Controls and events " +
            "as PitrigPlugin.Button1 to Button16 and SwitchPosition1 to SwitchPosition12.";

        private static readonly Brush IdleBorder = Frozen(new SolidColorBrush(Color.FromArgb(0x60, 0x9E, 0x9E, 0x9E)));

        private readonly InputState inputs;
        private readonly Border[] tiles = new Border[InputState.ButtonCount];
        private readonly TextBlock[] names = new TextBlock[InputState.ButtonCount];
        private readonly TextBlock position = PageParts.Text(string.Empty);
        private readonly TextBlock last = PageParts.Text(string.Empty);
        private readonly TextBlock wiring = PageParts.Caption(string.Empty);

        public ButtonsTab(InputState inputs)
        {
            this.inputs = inputs;
            var grid = new UniformGrid { Columns = Columns };
            for (var index = 0; index < tiles.Length; index += 1) grid.Children.Add(Tile(index));
            var frame = new Grid { Margin = PageParts.RowMargin };
            frame.ColumnDefinitions.Add(new ColumnDefinition { MaxWidth = GridMaxWidth });
            frame.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            frame.Children.Add(grid);
            Content = PageParts.Stack(
                PageParts.Section("BUTTONS", frame, wiring),
                PageParts.Section("SWITCH", position),
                PageParts.Section("LAST PRESS", last));
        }

        public UIElement Content { get; }

        public void Show()
        {
            var snapshot = inputs.Snapshot();
            var recent = snapshot.LastAgeMs <= RecentPressMs ? snapshot.LastButtons : 0;
            for (var index = 0; index < tiles.Length; index += 1)
            {
                Light(tiles[index], ((snapshot.Held | recent) & (1u << index)) != 0);
                names[index].Text = snapshot.Names[index] ?? string.Empty;
            }
            position.Text = snapshot.Position > 0
                ? "Position " + snapshot.Position.ToString(CultureInfo.InvariantCulture)
                : "No position yet.";
            last.Text = LastPress(snapshot);
            wiring.Text = snapshot.Wired ? Wiring : "No buttons are wired yet. " + Wiring;
        }

        private UIElement Tile(int index)
        {
            names[index] = new TextBlock
            {
                FontSize = NameSize,
                TextTrimming = TextTrimming.CharacterEllipsis,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            var number = new TextBlock
            {
                Text = (index + 1).ToString(CultureInfo.InvariantCulture),
                FontSize = NumberSize,
                FontWeight = FontWeights.SemiBold,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            tiles[index] = new Border
            {
                Height = TileHeight,
                Margin = new Thickness(0, 0, 6, 6),
                Padding = new Thickness(4),
                CornerRadius = new CornerRadius(4),
                BorderThickness = new Thickness(1),
                Child = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { number, names[index] } }
            };
            Light(tiles[index], false);
            return tiles[index];
        }

        private static void Light(Border tile, bool on)
        {
            tile.Background = on ? PageParts.AccentBrush : Brushes.Transparent;
            tile.BorderBrush = on ? PageParts.AccentBrush : IdleBorder;
            if (on) tile.SetValue(TextElement.ForegroundProperty, Brushes.White);
            else tile.ClearValue(TextElement.ForegroundProperty);
        }

        private static string LastPress(InputSnapshot snapshot)
        {
            if (snapshot.LastInput.Length == 0) return "Nothing pressed yet. Press a button on the wheel, a button box or the keyboard.";
            var targets = new List<string>();
            for (var index = 0; index < InputState.ButtonCount; index += 1)
            {
                if ((snapshot.LastButtons & (1u << index)) == 0) continue;
                var name = snapshot.Names[index];
                var button = "button " + (index + 1).ToString(CultureInfo.InvariantCulture);
                targets.Add(string.IsNullOrEmpty(name) ? button : button + " (" + name + ")");
            }
            if (snapshot.LastPosition > 0)
            {
                targets.Add("switch position " + snapshot.LastPosition.ToString(CultureInfo.InvariantCulture));
            }
            var pressed = targets.Count == 0 ? "not wired to a button" : string.Join(", ", targets);
            return snapshot.LastInput + " → " + pressed;
        }

        private static Brush Frozen(Brush brush)
        {
            brush.Freeze();
            return brush;
        }
    }
}
