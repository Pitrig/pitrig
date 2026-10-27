using System;
using System.Linq;
using System.Threading;

namespace Pitrig.SimHub
{
    internal interface ILineSink
    {
        void Add(string wireId, string value);
    }

    internal sealed class FieldStream
    {
        private static readonly string Unsent = new string('\u0000', 1);

        private readonly string[] sent = new string[TelemetryCatalog.Fields.Length];
        private int[] indices = new int[0];
        private int[] requested;
        private bool restarted = true;
        private double refreshedAt;
        private double refreshCredit;
        private int refreshCursor;

        public FieldStream()
        {
            Restart();
        }

        public int[] Indices => Volatile.Read(ref requested) ?? Volatile.Read(ref indices);

        public void Subscribe(int[] fields)
        {
            if (Indices.SequenceEqual(fields)) return;
            Volatile.Write(ref requested, fields);
        }

        public void Restart()
        {
            for (var index = 0; index < sent.Length; index += 1) sent[index] = Unsent;
            restarted = true;
        }

        public void Collect(FieldValues values, double now, ILineSink sink)
        {
            var request = Interlocked.Exchange(ref requested, null);
            if (request != null)
            {
                Volatile.Write(ref indices, request);
                Restart();
            }
            var fields = Volatile.Read(ref indices);
            for (var position = 0; position < fields.Length; position += 1)
            {
                var index = fields[position];
                var value = values.Get(index);
                if (ReferenceEquals(value, sent[index])) continue;
                sent[index] = value;
                sink.Add(TelemetryCatalog.Fields[index].WireId, value ?? string.Empty);
            }
            Refresh(fields, now, sink);
        }

        private void Refresh(int[] fields, double now, ILineSink sink)
        {
            if (restarted || fields.Length == 0)
            {
                restarted = false;
                refreshedAt = now;
                refreshCredit = 0;
                return;
            }
            var share = (now - refreshedAt) * fields.Length / TelemetryCatalog.LinkKeyframeIntervalMs;
            refreshCredit = Math.Min(fields.Length, refreshCredit + share);
            refreshedAt = now;
            while (refreshCredit >= 1)
            {
                refreshCredit -= 1;
                refreshCursor = (refreshCursor + 1) % fields.Length;
                var index = fields[refreshCursor];
                var value = sent[index];
                if (ReferenceEquals(value, Unsent)) continue;
                sink.Add(TelemetryCatalog.Fields[index].WireId, value ?? string.Empty);
            }
        }
    }
}
