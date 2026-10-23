using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace Pitrig.SimHub
{
    internal enum BoardState
    {
        Connecting,
        Streaming,
        SafeMode,
        Busy,
        Silent,
        Lost,
        Released
    }

    internal sealed class BoardSession : ILineSink
    {
        private const int PollMs = 5;
        private const int IdleMs = 250;
        private const int ReplyTimeoutMs = 1500;
        private const int DocumentTimeoutMs = 15000;
        private const int IdentifyAttempts = 3;
        private const int IdentifyPauseMs = 500;
        private const int StopTimeoutMs = 2000;
        private const int WriteChunkBytes = 1024;
        private const int ReadChunkBytes = 4096;
        private const int MaximumLineBytes = 160 * 1024;
        private const string InfoRequest = "\n@PR:INFO\n";
        private const string InfoReply = "@PR:OK:INFO:";
        private const string DocumentReply = "@PR:OK:CONFIG:";
        private const string ErrorReply = "@PR:ERR:";
        private const string UnknownDocument = "@PR:ERR:unknown_document";

        private readonly FieldValues values;
        private readonly int[] handedFields;
        private readonly FieldStream stream = new FieldStream();
        private readonly AutoResetEvent wake = new AutoResetEvent(false);
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly byte[] output = new byte[WriteChunkBytes];
        private readonly byte[] input = new byte[ReadChunkBytes];
        private readonly LineAssembler assembler = new LineAssembler(MaximumLineBytes);
        private readonly List<string> lines = new List<string>();
        private readonly Thread thread;
        private NativeSerial serial;
        private volatile bool stopping;
        private int state;
        private int length;
        private long bytesSent;

        public BoardSession(string portName, int baudRate, int[] handedFields, FieldValues values)
        {
            PortName = portName;
            BaudRate = baudRate;
            this.handedFields = handedFields;
            this.values = values;
            thread = new Thread(Run) { IsBackground = true, Name = "Pitrig " + portName };
        }

        public string PortName { get; }

        public int BaudRate { get; }

        public string Board { get; private set; } = string.Empty;

        public string Firmware { get; private set; } = string.Empty;

        public string Problem { get; private set; } = string.Empty;

        public BoardState State => (BoardState)Volatile.Read(ref state);

        public long BytesSent => Interlocked.Read(ref bytesSent);

        public int[] Fields => stream.Indices;

        public bool Finished => !thread.IsAlive;

        public void Start()
        {
            thread.Start();
        }

        public void Wake()
        {
            wake.Set();
        }

        public void Stop()
        {
            stopping = true;
            wake.Set();
            if (thread.IsAlive) thread.Join(StopTimeoutMs);
        }

        public void Add(string wireId, string value)
        {
            var line = wireId + ";" + value + "\n";
            if (length + Encoding.UTF8.GetByteCount(line) > output.Length) Flush();
            length += Encoding.UTF8.GetBytes(line, 0, line.Length, output, length);
        }

        private void Run()
        {
            try
            {
                serial = NativeSerial.Open(PortName, BaudRate);
                var info = Identify();
                if (info == null)
                {
                    SetState(BoardState.Silent);
                    return;
                }
                Board = info.Board;
                Firmware = info.Firmware;
                if (info.SafeMode)
                {
                    SetState(BoardState.SafeMode);
                    Idle();
                    return;
                }
                stream.Subscribe(handedFields ?? Subscription.Of(Document("dashboard"), Document("modules")));
                SetState(BoardState.Streaming);
                Stream();
            }
            catch (SerialPortException exception)
            {
                Problem = exception.Message;
                SetState(exception.Busy ? BoardState.Busy : BoardState.Lost);
            }
            catch (Exception exception)
            {
                Problem = exception.Message;
                SetState(BoardState.Lost);
            }
            finally
            {
                serial?.Dispose();
                serial = null;
                if (stopping) SetState(BoardState.Released);
            }
        }

        private BoardInfo Identify()
        {
            for (var attempt = 0; attempt < IdentifyAttempts && !stopping; attempt += 1)
            {
                var reply = Request(InfoRequest, InfoReply, ReplyTimeoutMs, null);
                if (reply != null) return BoardInfo.Parse(reply.Substring(InfoReply.Length));
                Pause(IdentifyPauseMs);
            }
            return null;
        }

        private string Document(string name)
        {
            var prefix = DocumentReply + name + ":";
            var reply = Request("@PR:GET:" + name + "\n", prefix, DocumentTimeoutMs, UnknownDocument);
            if (reply == null) throw new IOException("The board did not send its " + name + " document.");
            return reply.StartsWith(prefix, StringComparison.Ordinal) ? reply.Substring(prefix.Length) : string.Empty;
        }

        private string Request(string command, string prefix, int timeoutMs, string acceptedError)
        {
            Send(command);
            var deadline = clock.ElapsedMilliseconds + timeoutMs;
            while (!stopping && clock.ElapsedMilliseconds < deadline)
            {
                foreach (var line in ReadLines())
                {
                    if (line.StartsWith(prefix, StringComparison.Ordinal)) return line;
                    if (acceptedError != null && line.StartsWith(acceptedError, StringComparison.Ordinal)) return line;
                    if (line.StartsWith(ErrorReply, StringComparison.Ordinal)) return null;
                }
                wake.WaitOne(PollMs);
            }
            return null;
        }

        private void Stream()
        {
            while (!stopping)
            {
                wake.WaitOne(PollMs);
                if (stopping) return;
                stream.Collect(values, clock.Elapsed.TotalMilliseconds, this);
                Flush();
                ReadLines();
            }
        }

        private void Idle()
        {
            while (!stopping)
            {
                wake.WaitOne(IdleMs);
                ReadLines();
            }
        }

        private void Pause(int milliseconds)
        {
            var until = clock.ElapsedMilliseconds + milliseconds;
            while (!stopping && clock.ElapsedMilliseconds < until) wake.WaitOne(PollMs);
        }

        private List<string> ReadLines()
        {
            lines.Clear();
            int count;
            while ((count = serial.Read(input)) > 0) assembler.Feed(input, count, lines);
            return lines;
        }

        private void Send(string text)
        {
            Flush();
            var bytes = Encoding.ASCII.GetBytes(text);
            serial.Write(bytes, bytes.Length);
            Interlocked.Add(ref bytesSent, bytes.Length);
        }

        private void Flush()
        {
            if (length == 0) return;
            serial.Write(output, length);
            Interlocked.Add(ref bytesSent, length);
            length = 0;
        }

        private void SetState(BoardState next)
        {
            Volatile.Write(ref state, (int)next);
        }
    }
}
