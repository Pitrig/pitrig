using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Pitrig.SimHub
{
    internal sealed class SerialPortException : IOException
    {
        public SerialPortException(bool busy, string message) : base(message)
        {
            Busy = busy;
        }

        public bool Busy { get; }
    }

    internal sealed class NativeSerial : IDisposable
    {
        private const uint GenericRead = 0x80000000;
        private const uint GenericWrite = 0x40000000;
        private const uint OpenExisting = 3;
        private const uint PurgeAll = 0x000F;
        private const uint QueueBytes = 16384;
        private const uint Immediate = 0xFFFFFFFF;
        private const uint WriteTimeoutMs = 2000;
        private const uint ClearRts = 4;
        private const uint ClearDtr = 6;
        private const int AccessDenied = 5;
        private const int SharingViolation = 32;
        private const int BinaryFlag = 0x0001;
        private const byte EightBits = 8;

        private readonly SafeFileHandle handle;

        private NativeSerial(SafeFileHandle handle)
        {
            this.handle = handle;
        }

        public static NativeSerial Open(string portName, int baudRate)
        {
            var opened = CreateFile(@"\\.\" + portName, GenericRead | GenericWrite, 0, IntPtr.Zero,
                OpenExisting, 0, IntPtr.Zero);
            if (opened.IsInvalid)
            {
                var error = Marshal.GetLastWin32Error();
                opened.Dispose();
                throw new SerialPortException(error == AccessDenied || error == SharingViolation,
                    new Win32Exception(error).Message);
            }
            try
            {
                Configure(opened, baudRate);
                return new NativeSerial(opened);
            }
            catch
            {
                opened.Dispose();
                throw;
            }
        }

        public void Write(byte[] buffer, int count)
        {
            if (count == 0) return;
            if (!WriteFile(handle, buffer, count, out var written, IntPtr.Zero)) Fail();
            if (written != count) throw new IOException("The board stopped taking data.");
        }

        public int Read(byte[] buffer)
        {
            if (!ReadFile(handle, buffer, buffer.Length, out var read, IntPtr.Zero)) Fail();
            return read;
        }

        public int PendingOutput()
        {
            return ClearCommError(handle, out _, out var status) ? (int)status.OutQueue : 0;
        }

        public void Cancel()
        {
            try
            {
                CancelIoEx(handle, IntPtr.Zero);
            }
            catch (ObjectDisposedException)
            {
            }
        }

        public void Dispose()
        {
            handle.Dispose();
        }

        private static void Configure(SafeFileHandle opened, int baudRate)
        {
            if (!SetupComm(opened, QueueBytes, QueueBytes)) Fail();
            var control = new DeviceControlBlock { Length = Marshal.SizeOf(typeof(DeviceControlBlock)) };
            if (!GetCommState(opened, ref control)) Fail();
            control.BaudRate = baudRate;
            control.Flags = BinaryFlag;
            control.ByteSize = EightBits;
            control.Parity = 0;
            control.StopBits = 0;
            if (!SetCommState(opened, ref control)) Fail();
            if (!EscapeCommFunction(opened, ClearDtr) || !EscapeCommFunction(opened, ClearRts)) Fail();
            var timeouts = new CommTimeouts
            {
                ReadInterval = Immediate,
                WriteTotalConstant = WriteTimeoutMs
            };
            if (!SetCommTimeouts(opened, ref timeouts)) Fail();
            PurgeComm(opened, PurgeAll);
        }

        private static void Fail()
        {
            var error = Marshal.GetLastWin32Error();
            throw new SerialPortException(false, new Win32Exception(error).Message);
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct DeviceControlBlock
        {
            public int Length;
            public int BaudRate;
            public int Flags;
            public short Reserved;
            public short XonLimit;
            public short XoffLimit;
            public byte ByteSize;
            public byte Parity;
            public byte StopBits;
            public byte XonChar;
            public byte XoffChar;
            public byte ErrorChar;
            public byte EofChar;
            public byte EventChar;
            public short ReservedTail;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CommTimeouts
        {
            public uint ReadInterval;
            public uint ReadTotalMultiplier;
            public uint ReadTotalConstant;
            public uint WriteTotalMultiplier;
            public uint WriteTotalConstant;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CommStatus
        {
            public uint Flags;
            public uint InQueue;
            public uint OutQueue;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security,
            uint creation, uint flags, IntPtr template);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetupComm(SafeFileHandle file, uint inputQueue, uint outputQueue);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetCommState(SafeFileHandle file, ref DeviceControlBlock control);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetCommState(SafeFileHandle file, ref DeviceControlBlock control);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetCommTimeouts(SafeFileHandle file, ref CommTimeouts timeouts);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool PurgeComm(SafeFileHandle file, uint flags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool EscapeCommFunction(SafeFileHandle file, uint function);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ClearCommError(SafeFileHandle file, out uint errors, out CommStatus status);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CancelIoEx(SafeFileHandle file, IntPtr overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteFile(SafeFileHandle file, byte[] buffer, int count, out int written,
            IntPtr overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadFile(SafeFileHandle file, byte[] buffer, int count, out int read,
            IntPtr overlapped);
    }
}
