using System;
using System.Runtime.CompilerServices;

namespace Pitrig.SimHub
{
    internal sealed class ScanGuard
    {
        private const string Reason = "Pitrig";
        private const string Unprotected = "SimHub's port scan is not kept off Pitrig boards: ";

        private readonly Func<string, bool> isPitrigPort;
        private object scanner;
        private bool failed;

        public ScanGuard(Func<string, bool> isPitrigPort)
        {
            this.isPitrigPort = isPitrigPort;
        }

        public void Attach()
        {
            try
            {
                Subscribe();
            }
            catch (Exception exception)
            {
                PluginLog.Warn(Unprotected + exception.Message);
            }
        }

        public void Detach()
        {
            if (scanner == null) return;
            try
            {
                Unsubscribe();
            }
            catch (Exception exception)
            {
                PluginLog.Warn(Unprotected + exception.Message);
            }
            scanner = null;
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private void Subscribe()
        {
            var instance = global::SerialDash.ComportScanner.Instance;
            if (instance == null)
            {
                PluginLog.Warn(Unprotected + "SimHub has no port scanner");
                return;
            }
            instance.CanBeScanned += Screen;
            scanner = instance;
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private void Unsubscribe()
        {
            ((global::SerialDash.ComportScanner)scanner).CanBeScanned -= Screen;
        }

        private void Screen(object sender, global::SerialDash.SerialDashController.ScanArgs port)
        {
            try
            {
                Mark(port);
            }
            catch (Exception exception)
            {
                if (failed) return;
                failed = true;
                PluginLog.Warn(Unprotected + exception.Message);
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private void Mark(global::SerialDash.SerialDashController.ScanArgs port)
        {
            if (port == null || port.PortIsBusy || !isPitrigPort(port.ComPort)) return;
            port.PortIsBusy = true;
            port.BusyReason = Reason;
        }
    }
}
