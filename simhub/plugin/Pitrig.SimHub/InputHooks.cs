using SimHub.Plugins;

namespace Pitrig.SimHub
{
    internal sealed class InputHooks
    {
        private readonly InputState inputs;
        private PluginManager manager;

        public InputHooks(InputState inputs)
        {
            this.inputs = inputs;
        }

        public void Attach(PitrigPlugin plugin, PluginManager pluginManager)
        {
            for (var button = 0; button < InputState.ButtonCount; button += 1)
            {
                var index = button;
                plugin.AddAction("Button" + (index + 1), (source, name) => inputs.Action(index, true),
                    (source, name) => inputs.Action(index, false));
            }
            for (var position = 1; position <= InputState.PositionCount; position += 1)
            {
                var selected = position;
                plugin.AddAction("SwitchPosition" + selected, (source, name) => inputs.Select(selected),
                    (source, name) => { });
            }
            manager = pluginManager;
            manager.InputPressed += Pressed;
            manager.InputReleased += Released;
        }

        public void Detach()
        {
            if (manager == null) return;
            manager.InputPressed -= Pressed;
            manager.InputReleased -= Released;
            manager = null;
        }

        private bool Pressed(string input)
        {
            inputs.Changed(input, true);
            return false;
        }

        private bool Released(string input)
        {
            inputs.Changed(input, false);
            return false;
        }
    }
}
