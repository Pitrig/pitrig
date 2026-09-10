using System;
using System.Diagnostics;
using System.Windows.Controls;
using System.Windows.Media;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    [PluginName("Pitrig telemetry")]
    [PluginDescription("Sends the Pitrig telemetry catalog to the configurator, which forwards it to the board")]
    [PluginAuthor("Pitrig")]
    public class PitrigPlugin : IPlugin, IDataPlugin, IWPFSettingsV2
    {
        private const string SettingsName = "Link";
        private const double ChangesIntervalMs = 100;

        private static readonly Lazy<ImageSource> Icon = new Lazy<ImageSource>(CreateIcon);

        private readonly TelemetryLink link = new TelemetryLink();
        private readonly FieldReader reader = new FieldReader();
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly double[] due = new double[TelemetryCatalog.Fields.Length];
        private double nextKeyframe;

        public PluginManager PluginManager { get; set; }

        public PluginSettings Settings { get; private set; } = new PluginSettings();

        public string Error { get; private set; }

        public string Target => link.Target;

        public string LocalAddresses => TelemetryLink.LocalAddresses();

        public long PacketsSent => link.PacketsSent;

        public long LinesSent => link.LinesSent;

        public long SendErrors => link.SendErrors;

        public string LeftMenuTitle => "Pitrig";

        public ImageSource PictureIcon => Icon.Value;

        public void Init(PluginManager pluginManager)
        {
            Apply(this.ReadCommonSettings(SettingsName, () => new PluginSettings()));
        }

        public void End(PluginManager pluginManager)
        {
            this.SaveCommonSettings(SettingsName, Settings);
            link.Close();
        }

        public Control GetWPFSettingsControl(PluginManager pluginManager)
        {
            return new SettingsControl(this);
        }

        public void Apply(PluginSettings settings)
        {
            Settings = settings;
            this.SaveCommonSettings(SettingsName, settings);
            reader.Reset();
            Array.Clear(due, 0, due.Length);
            nextKeyframe = 0;
            Error = null;
            link.Close();
            if (!settings.Enabled) return;
            try
            {
                link.Open(settings.Port);
            }
            catch (Exception exception)
            {
                Error = exception.Message;
            }
        }

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            if (!Settings.Enabled) return;
            if (link.TakeNewSubscriber()) nextKeyframe = 0;
            if (!link.Ready) return;
            var now = clock.Elapsed.TotalMilliseconds;
            var keyframe = now >= nextKeyframe;
            if (keyframe) nextKeyframe = now + TelemetryCatalog.LinkKeyframeIntervalMs;
            var fields = TelemetryCatalog.Fields;
            for (var index = 0; index < fields.Length; index += 1)
            {
                if (!keyframe && now < due[index]) continue;
                var field = fields[index];
                due[index] = now + IntervalOf(field.Rate);
                var text = reader.Read(pluginManager, field);
                if (reader.Commit(index, text, keyframe)) link.Add(field.WireId, text ?? string.Empty);
            }
            link.Flush();
        }

        private static double IntervalOf(FieldRate rate)
        {
            switch (rate)
            {
                case FieldRate.Fast:
                    return 1000.0 / TelemetryCatalog.FastHertz;
                case FieldRate.Normal:
                    return 1000.0 / TelemetryCatalog.NormalHertz;
                case FieldRate.Slow:
                    return 1000.0 / TelemetryCatalog.SlowHertz;
                default:
                    return ChangesIntervalMs;
            }
        }

        private static ImageSource CreateIcon()
        {
            var geometry = Geometry.Parse("M8,1 L15,15 L8,11 L1,15 Z");
            var image = new DrawingImage(new GeometryDrawing(Brushes.White, null, geometry));
            image.Freeze();
            return image;
        }
    }
}
