namespace Pitrig.SimHub
{
    internal sealed class DamageHits
    {
        private const string DamageMax = "DataCorePlugin.GameData.NewData.CarDamagesMax";
        private const string IracingRepair = "DataCorePlugin.GameRawData.Telemetry.PitRepairLeft";
        private const string IracingOptionalRepair = "DataCorePlugin.GameRawData.Telemetry.PitOptRepairLeft";
        private const double Step = 0.5;

        private double? last;

        public uint Count { get; private set; }

        public void Update(TelemetryState state)
        {
            var total = Total(state);
            if (total == null) return;
            if (last != null && total.Value >= last.Value + Step) Count++;
            last = total;
        }

        private static double? Total(TelemetryState state)
        {
            var status = state.Status;
            if (status == null) return null;
            return status.CarDamage1 + status.CarDamage2 + status.CarDamage3 + status.CarDamage4
                + (Raw(state, DamageMax) ?? 0)
                + (Raw(state, IracingRepair) ?? 0)
                + (Raw(state, IracingOptionalRepair) ?? 0);
        }

        private static double? Raw(TelemetryState state, string property)
        {
            return Computed.Number(state.Manager?.GetPropertyValue(property));
        }
    }
}
