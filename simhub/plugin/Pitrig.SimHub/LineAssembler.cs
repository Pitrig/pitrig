using System;
using System.Collections.Generic;
using System.Text;

namespace Pitrig.SimHub
{
    internal sealed class LineAssembler
    {
        private const byte NewLine = (byte)'\n';
        private const byte CarriageReturn = (byte)'\r';

        private readonly int capacity;
        private byte[] buffer = new byte[256];
        private int length;
        private bool discarding;

        public LineAssembler(int capacity)
        {
            this.capacity = capacity;
        }

        public void Feed(byte[] data, int count, List<string> lines)
        {
            for (var index = 0; index < count; index += 1)
            {
                var value = data[index];
                if (value == NewLine)
                {
                    if (!discarding && length > 0) lines.Add(Encoding.UTF8.GetString(buffer, 0, length));
                    length = 0;
                    discarding = false;
                    continue;
                }
                if (value == CarriageReturn || discarding) continue;
                if (length == capacity)
                {
                    discarding = true;
                    length = 0;
                    continue;
                }
                if (length == buffer.Length) Array.Resize(ref buffer, Math.Min(capacity, buffer.Length * 2));
                buffer[length++] = value;
            }
        }
    }
}
