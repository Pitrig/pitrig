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
        private const int IdentifyAttempts = 3;
        private const int IdentifyPauseMs = 500;
        private const int BusyRetryMs = 20;
        private const int StopTimeoutMs = 2000;
        private const int WriteChunkBytes = 1024;
        private const int ReadChunkBytes = 4096;
        private const int MaximumLineBytes = 160 * 1024;
        private const int OutputHighWater = 512;
        private const string InfoRequest = "\n@PR:INFO\n";
        private const string InfoReply = "@PR:OK:INFO:";
        private const string BusyReply = "@PR:ERR:busy";
        private const string ErrorReply = "@PR:ERR:";

        private readonly FieldValues values;
        private readonly InputState inputs;
        private readonly int[] handedFields;
        private readonly int[] rememberedFields;
        private readonly FieldStream stream = new FieldStream();
        private readonly AutoResetEvent wake = new AutoResetEvent(false);
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly byte[] output = new byte[WriteChunkBytes];
        private readonly byte[] input = new byte[ReadChunkBytes];
        private readonly LineAssembler assembler = new LineAssembler(MaximumLineBytes);
        private readonly List<string> lines = new List<string>();
        private readonly Thread thread;
        private volatile NativeSerial serial;
        private DocumentReader documents;
        private volatile bool stopping;
        private int state;
        private int length;
        private long bytesSent;

        public BoardSession(string portName, int baudRate, int[] handedFields, int[] rememberedFields,
            FieldValues values, InputState inputs)
        {
            PortName = portName;
            BaudRate = baudRate;
            this.handedFields = handedFields;
            this.rememberedFields = rememberedFields;
            this.values = values;
            this.inputs = inputs;
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
            serial?.Cancel();
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
                SetState(BoardState.Connecting);
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
                documents = new DocumentReader(clock.Elapsed.TotalMilliseconds, handedFields == null);
                Subscribe(handedFields ?? rememberedFields ?? new int[0],
                    handedFields != null ? "the configurator" : rememberedFields != null ? "the last session" : "nowhere yet");
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
                var reply = Request(InfoRequest, InfoReply, ReplyTimeoutMs);
                if (reply != null) return BoardInfo.Parse(reply.Substring(InfoReply.Length));
                Pause(IdentifyPauseMs);
            }
            return null;
        }

        private string Request(string command, string prefix, int timeoutMs)
        {
            var started = clock.ElapsedMilliseconds;
            var busy = 0;
            Send(command);
            while (!stopping && clock.ElapsedMilliseconds - started < timeoutMs)
            {
                var resend = false;
                foreach (var line in ReadLines())
                {
                    if (line.StartsWith(prefix, StringComparison.Ordinal))
                    {
                        PluginTrace.Request(PortName, command, clock.ElapsedMilliseconds - started, busy, "answered");
                        return line;
                    }
                    resend = string.Equals(line, BusyReply, StringComparison.Ordinal);
                    if (resend) break;
                    if (!line.StartsWith(ErrorReply, StringComparison.Ordinal)) continue;
                    PluginTrace.Request(PortName, command, clock.ElapsedMilliseconds - started, busy, line);
                    return null;
                }
                if (resend)
                {
                    busy += 1;
                    Pause(BusyRetryMs);
                    Send(command);
                    continue;
                }
                wake.WaitOne(PollMs);
            }
            PluginTrace.Request(PortName, command, clock.ElapsedMilliseconds - started, busy, "no answer");
            return null;
        }

        private void Stream()
        {
            while (!stopping)
            {
                wake.WaitOne(PollMs);
                if (stopping) return;
                var now = clock.Elapsed.TotalMilliseconds;
                ReadDocuments(now);
                if (serial.PendingOutput() <= OutputHighWater) stream.Collect(values, now, this);
                Flush();
            }
        }

        private void ReadDocuments(double now)
        {
            var reader = documents;
            foreach (var line in ReadLines()) reader?.Accept(line, now);
            if (reader == null) return;
            if (reader.Done)
            {
                documents = null;
                PluginTrace.Event(PortName, $"documents read in {reader.Elapsed(now):0} ms, {reader.Bytes} bytes, " +
                                            $"{reader.BusyRetries} busy answers repeated");
                inputs.Map(PortName, reader.Mapping);
                if (handedFields == null) Subscribe(reader.Fields, "the documents");
                return;
            }
            if (reader.Failed(now))
            {
                documents = null;
                if (stream.Indices.Length == 0) throw new IOException("The board did not send its documents.");
                PluginTrace.Event(PortName, "documents not read, keeping the fields of the last session");
                return;
            }
            var command = reader.Due(now);
            if (command != null) Append(command);
        }

        private void Subscribe(int[] fields, string source)
        {
            stream.Subscribe(fields);
            PluginTrace.Event(PortName, $"streaming {fields.Length} fields from {source}");
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
            Append(text);
            Flush();
        }

        private void Append(string text)
        {
            var count = Encoding.ASCII.GetByteCount(text);
            if (length + count > output.Length) Flush();
            length += Encoding.ASCII.GetBytes(text, 0, text.Length, output, length);
        }

        private void Flush()
        {
            if (length == 0) return;
            var started = clock.Elapsed.TotalMilliseconds;
            serial.Write(output, length);
            PluginTrace.Write(PortName, length, clock.Elapsed.TotalMilliseconds - started);
            Interlocked.Add(ref bytesSent, length);
            length = 0;
        }

        private void SetState(BoardState next)
        {
            Volatile.Write(ref state, (int)next);
            PluginTrace.State(PortName, next.ToString());
        }
    }
}
