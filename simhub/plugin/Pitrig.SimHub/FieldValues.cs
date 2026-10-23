using System;
using System.Threading;

namespace Pitrig.SimHub
{
    internal sealed class FieldValues
    {
        private readonly string[] current = new string[TelemetryCatalog.Fields.Length];

        public string Get(int index)
        {
            return Volatile.Read(ref current[index]);
        }

        public void Set(int index, string text)
        {
            if (string.Equals(current[index], text, StringComparison.Ordinal)) return;
            Volatile.Write(ref current[index], text);
        }
    }
}
