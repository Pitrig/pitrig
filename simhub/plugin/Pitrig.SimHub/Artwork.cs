using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Pitrig.SimHub
{
    internal static class Artwork
    {
        private const string Mark =
            "M51.84 144V-380.16H262.08Q378.72 -380.16 378.72 -263.52V-116.64Q378.72 0 262.08 0H151.2V144Z" +
            "M151.2 -86.4H256.32Q279.36 -86.4 279.36 -109.44V-270.72Q279.36 -293.76 256.32 -293.76H151.2Z";

        private const string Pit =
            "M14.4 40V-105.6H72.8Q105.2 -105.6 105.2 -73.2V-32.4Q105.2 0 72.8 0H42V40Z" +
            "M42 -24H71.2Q77.6 -24 77.6 -30.4V-75.2Q77.6 -81.6 71.2 -81.6H42Z" +
            "M131.8 -123V-150H160.6V-123ZM132.4 0V-105.6H160V0Z" +
            "M188 -32.4V-138H215.6V-105.6H250V-81.6H215.6V-30.4Q215.6 -24 222 -24H252V-9L240 0H220.4Q188 0 188 -32.4Z";

        private const string Rig =
            "M258.8 0V-92Q266.2 -105.6 287.2 -105.6H308.8L320.8 -96.6V-81.6H294.6Q288.6 -81.6 286.4 -78.6V0Z" +
            "M339.8 -123V-150H368.6V-123ZM340.4 0V-105.6H368V0Z" +
            "M394.4 -32.4V-73.2Q394.4 -105.6 426.8 -105.6H485.2V7.6Q485.2 40 452.8 40H415.4L403.4 31V16H451.2" +
            "Q457.6 16 457.6 9.6V0H426.8Q394.4 0 394.4 -32.4Z" +
            "M422 -30.4Q422 -24 428.4 -24H457.6V-81.6H428.4Q422 -81.6 422 -75.2Z";

        private const double CardSize = 740;
        private const double IconMargin = 90;
        private const double WordmarkWidth = 494.8;
        private const double WordmarkHeight = 214;

        private static readonly Vector MarkOffset = new Vector(154.72, 488.08);
        private static readonly Vector GlyphOffset = new Vector(-2.4, 162);

        public static ImageSource MenuIcon()
        {
            var mark = Geometry.Parse(Mark).Clone();
            mark.Transform = new TranslateTransform(MarkOffset.X, MarkOffset.Y);
            var drawing = new DrawingGroup();
            var bounds = new Rect(IconMargin, IconMargin, CardSize - 2 * IconMargin, CardSize - 2 * IconMargin);
            drawing.Children.Add(new GeometryDrawing(Brushes.Transparent, null, new RectangleGeometry(bounds)));
            drawing.Children.Add(new GeometryDrawing(Brushes.White, null, mark));
            var image = new DrawingImage(drawing);
            image.Freeze();
            return image;
        }

        public static FrameworkElement Wordmark(double height)
        {
            var glyphs = new Canvas { RenderTransform = new TranslateTransform(GlyphOffset.X, GlyphOffset.Y) };
            glyphs.Children.Add(new Path { Data = Geometry.Parse(Pit), Fill = PitBrush() });
            var rig = new Path { Data = Geometry.Parse(Rig) };
            rig.SetBinding(Shape.FillProperty, new Binding
            {
                Path = new PropertyPath(TextElement.ForegroundProperty),
                RelativeSource = RelativeSource.Self
            });
            glyphs.Children.Add(rig);
            var canvas = new Canvas { Width = WordmarkWidth, Height = WordmarkHeight };
            canvas.Children.Add(glyphs);
            return new Viewbox { Child = canvas, Height = height, HorizontalAlignment = HorizontalAlignment.Left };
        }

        private static Brush PitBrush()
        {
            var brush = new LinearGradientBrush
            {
                MappingMode = BrushMappingMode.Absolute,
                StartPoint = new Point(0, 12),
                EndPoint = new Point(0, 202)
            };
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(0xC2, 0x7B, 0xFF), 0));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(0xA1, 0x5C, 0xF7), 0.33));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(0x90, 0x5E, 0xF2), 0.66));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(0x7B, 0x5B, 0xB9), 1));
            brush.Freeze();
            return brush;
        }
    }
}
