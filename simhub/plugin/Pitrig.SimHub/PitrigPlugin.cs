using System;
using System.Windows.Controls;
using System.Windows.Media;
using GameReaderCommon;
using SimHub.Plugins;

namespace Pitrig.SimHub
{
    [PluginName("Pitrig telemetry")]
    [PluginDescription("Finds Pitrig boards and sends each one the telemetry its dashboard uses")]
    [PluginAuthor("Pitrig")]
    public class PitrigPlugin : IPlugin, IDataPlugin, IWPFSettingsV2
    {
        private const string SettingsName = "Link";

        private static readonly Lazy<ImageSource> Icon = new Lazy<ImageSource>(CreateIcon);

        private InputHooks hooks;

        public PluginManager PluginManager { get; set; }

        public PluginSettings Settings { get; private set; } = new PluginSettings();

        public string LeftMenuTitle => "Pitrig";

        public ImageSource PictureIcon => Icon.Value;

        internal PluginHub Hub => PluginHub.Shared;

        public void Init(PluginManager pluginManager)
        {
            Settings = this.ReadCommonSettings(SettingsName, () => new PluginSettings());
            Hub.Attach(this);
            hooks = new InputHooks(Hub.Inputs);
            hooks.Attach(this, pluginManager);
        }

        public void End(PluginManager pluginManager)
        {
            hooks?.Detach();
            SaveSettings();
            Hub.Detach(this);
        }

        public Control GetWPFSettingsControl(PluginManager pluginManager)
        {
            return new SettingsControl(this);
        }

        public void Apply(PluginSettings settings)
        {
            Settings = settings;
            SaveSettings();
            Hub.Apply(settings);
        }

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            Hub.Update(pluginManager, data);
        }

        internal void SaveSettings()
        {
            this.SaveCommonSettings(SettingsName, Settings);
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
