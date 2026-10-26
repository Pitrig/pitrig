using System;
using System.Linq;

namespace Pitrig.SimHub
{
    internal sealed class DocumentReader
    {
        private const double RetryMs = 20;
        private const double ReplyTimeoutMs = 5000;
        private const double DeadlineMs = 15000;
        private const string ReplyPrefix = "@PR:OK:CONFIG:";
        private const string BusyReply = "@PR:ERR:busy";
        private const string UnknownDocument = "@PR:ERR:unknown_document";
        private const string ErrorReply = "@PR:ERR:";

        private static readonly string[] Names = { "dashboard", "modules" };

        private readonly string[] documents = new string[Names.Length];
        private readonly double startedAt;
        private int current;
        private double sentAt = double.NaN;
        private double sendAt;

        public DocumentReader(double now)
        {
            startedAt = now;
            sendAt = now;
        }

        public bool Done => current == Names.Length;

        public int BusyRetries { get; private set; }

        public int Bytes => documents.Sum(document => document?.Length ?? 0);

        public int[] Fields => Subscription.Of(documents);

        public double Elapsed(double now)
        {
            return now - startedAt;
        }

        public bool Failed(double now)
        {
            return !Done && now - startedAt > DeadlineMs;
        }

        public string Due(double now)
        {
            if (Done || now < sendAt) return null;
            if (!double.IsNaN(sentAt) && now - sentAt < ReplyTimeoutMs) return null;
            sentAt = now;
            return "@PR:GET:" + Names[current] + "\n";
        }

        public void Accept(string line, double now)
        {
            if (Done || double.IsNaN(sentAt)) return;
            var prefix = ReplyPrefix + Names[current] + ":";
            if (line.StartsWith(prefix, StringComparison.Ordinal))
            {
                Next(line.Substring(prefix.Length), now);
            }
            else if (string.Equals(line, UnknownDocument, StringComparison.Ordinal))
            {
                Next(string.Empty, now);
            }
            else if (line.StartsWith(ErrorReply, StringComparison.Ordinal))
            {
                if (string.Equals(line, BusyReply, StringComparison.Ordinal)) BusyRetries += 1;
                sentAt = double.NaN;
                sendAt = now + RetryMs;
            }
        }

        private void Next(string document, double now)
        {
            documents[current] = document;
            current += 1;
            sentAt = double.NaN;
            sendAt = now;
        }
    }
}
