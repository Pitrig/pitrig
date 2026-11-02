using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using SimHub.Plugins.Styles;

namespace Pitrig.SimHub
{
    internal enum Tone
    {
        Good,
        Waiting,
        Elsewhere,
        Problem,
        Idle
    }

    internal static class PageParts
    {
        public static readonly Thickness RowMargin = new Thickness(0, 6, 0, 0);
        public static readonly Thickness BlockMargin = new Thickness(0, 12, 0, 0);

        private const double DotSize = 10;
        private const double CaptionOpacity = 0.7;
        private const double SectionIndent = 20;

        private static readonly Brush[] ToneBrushes =
        {
            Solid(0x4C, 0xAF, 0x50),
            Solid(0xFF, 0xB3, 0x00),
            Solid(0xA1, 0x5C, 0xF7),
            Solid(0xE5, 0x39, 0x35),
            Solid(0x9E, 0x9E, 0x9E)
        };

        public static Brush ProblemBrush => ToneBrushes[(int)Tone.Problem];

        public static Brush AccentBrush => ToneBrushes[(int)Tone.Elsewhere];

        public static TabItem Tab(string header, UIElement content)
        {
            var page = new Border { Padding = new Thickness(4, 8, 16, 16), Child = content };
            return new SHTabItem
            {
                Header = header,
                Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = page }
            };
        }

        public static StackPanel Indented(params UIElement[] children)
        {
            var block = Stack(children);
            block.Margin = new Thickness(SectionIndent, 0, 0, 0);
            return block;
        }

        public static StackPanel Stack(params UIElement[] children)
        {
            var stack = new StackPanel();
            foreach (var child in children) stack.Children.Add(child);
            return stack;
        }

        public static SHSection Section(string title, params UIElement[] children)
        {
            return new SHSection { Title = title, Content = Stack(children), Margin = BlockMargin };
        }

        public static TextBlock Text(string text)
        {
            return new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, Margin = RowMargin };
        }

        public static TextBlock Caption(string text)
        {
            var caption = Text(text);
            caption.Opacity = CaptionOpacity;
            caption.Margin = new Thickness(0, 2, 0, 0);
            return caption;
        }

        public static FrameworkElement Row(Tone tone, string title, string detail, UIElement action = null)
        {
            var row = new Grid { Margin = RowMargin };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition());
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(new Ellipse
            {
                Width = DotSize,
                Height = DotSize,
                Fill = ToneBrushes[(int)tone],
                Margin = new Thickness(0, 4, 10, 0),
                VerticalAlignment = VerticalAlignment.Top
            });
            var text = new StackPanel();
            text.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            if (!string.IsNullOrEmpty(detail)) text.Children.Add(Caption(detail));
            Grid.SetColumn(text, 1);
            row.Children.Add(text);
            if (action == null) return row;
            Grid.SetColumn(action, 2);
            row.Children.Add(action);
            return row;
        }

        public static Button Link(string text, string address)
        {
            var link = new SHLinkButton
            {
                Content = text,
                ToolTip = address,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 2, 0, 2)
            };
            link.Click += (sender, arguments) => ConfiguratorApp.Start(address);
            return link;
        }

        public static Button ConfiguratorButton()
        {
            var button = new SHButtonSecondary
            {
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0)
            };
            button.Loaded += (sender, arguments) =>
                button.Content = ConfiguratorApp.Find() == null ? "Get the configurator" : "Open Pitrig configurator";
            button.Click += (sender, arguments) => ConfiguratorApp.Open(ConfiguratorApp.Find());
            return button;
        }

        public static void Watch(FrameworkElement element, DependencyProperty property, Action changed)
        {
            var descriptor = DependencyPropertyDescriptor.FromProperty(property, element.GetType());
            EventHandler handler = (sender, arguments) => changed();
            element.Loaded += (sender, arguments) =>
            {
                descriptor.RemoveValueChanged(element, handler);
                descriptor.AddValueChanged(element, handler);
            };
            element.Unloaded += (sender, arguments) => descriptor.RemoveValueChanged(element, handler);
        }

        private static Brush Solid(byte red, byte green, byte blue)
        {
            var brush = new SolidColorBrush(Color.FromRgb(red, green, blue));
            brush.Freeze();
            return brush;
        }
    }
}
