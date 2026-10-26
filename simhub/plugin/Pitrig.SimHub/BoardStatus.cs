namespace Pitrig.SimHub
{
    internal sealed class BoardStatus
    {
        public string Port { get; set; }

        public string Board { get; set; }

        public string Firmware { get; set; }

        public BoardState State { get; set; }

        public int Fields { get; set; }

        public double BytesPerSecond { get; set; }
    }

    internal sealed class ByteRate
    {
        private long bytes;
        private double at;

        public double Rate { get; private set; }

        public void Update(long total, double now)
        {
            if (at > 0 && now > at) Rate = (total - bytes) * 1000 / (now - at);
            bytes = total;
            at = now;
        }
    }
}
