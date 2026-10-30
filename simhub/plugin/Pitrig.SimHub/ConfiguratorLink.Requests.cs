using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Pitrig.SimHub
{
    internal sealed partial class ConfiguratorLink
    {
        public LinkDesired Desired()
        {
            lock (gate)
            {
                if (clock.Elapsed.TotalMilliseconds - holdsAt > SubscriberTimeoutMs && holds.Count > 0)
                {
                    holds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    wiring = null;
                }
                return new LinkDesired
                {
                    Holds = new HashSet<string>(holds, StringComparer.OrdinalIgnoreCase),
                    Sequence = sequence,
                    Wiring = wiring
                };
            }
        }

        public List<string> HeldPorts()
        {
            lock (gate)
            {
                if (clock.Elapsed.TotalMilliseconds - holdsAt > SubscriberTimeoutMs) return new List<string>();
                return holds.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList();
            }
        }

        public List<LinkRelease> TakeReleases()
        {
            lock (gate)
            {
                var taken = releases.ToList();
                releases.Clear();
                return taken;
            }
        }

        private bool TakeNewSubscriber()
        {
            lock (gate)
            {
                if (!subscriberIsNew) return false;
                subscriberIsNew = false;
                return true;
            }
        }

        private void Listen(Socket bound)
        {
            var buffer = new byte[ReceiveCapacity];
            EndPoint from = new IPEndPoint(IPAddress.Any, 0);
            while (true)
            {
                int count;
                try
                {
                    count = bound.ReceiveFrom(buffer, ref from);
                }
                catch (SocketException exception) when (exception.SocketErrorCode == SocketError.MessageSize)
                {
                    continue;
                }
                catch (Exception exception) when (exception is SocketException ||
                                                  exception is ObjectDisposedException)
                {
                    return;
                }
                if (count < HeaderBytes) continue;
                if (Encoding.ASCII.GetString(buffer, 0, 2) != TelemetryCatalog.LinkMagic) continue;
                if (buffer[2] != TelemetryCatalog.LinkVersion) continue;
                try
                {
                    Apply((IPEndPoint)from, LinkRequest.Parse(buffer, HeaderBytes, count - HeaderBytes));
                }
                catch (Exception exception)
                {
                    PluginLog.Warn("configurator request ignored: " + exception.Message);
                }
            }
        }

        private void Apply(IPEndPoint remote, LinkRequest request)
        {
            var control = IPAddress.IsLoopback(remote.Address);
            var changed = false;
            lock (gate)
            {
                if (subscriber == null || !subscriber.Equals(remote))
                {
                    subscriber = remote;
                    subscriberIsNew = true;
                    PluginTrace.Event(TraceSource, "requests now come from " + remote);
                }
                subscribedAt = clock.Elapsed.TotalMilliseconds;
                if (control)
                {
                    var holdsChanged = !holds.SetEquals(request.Holds);
                    if (holdsChanged) PluginTrace.Event(TraceSource, "holds [" + string.Join(",", request.Holds) + "]");
                    changed = holdsChanged || request.Releases.Count > 0 || request.Sequence != sequence;
                    holds = request.Holds;
                    holdsAt = subscribedAt;
                    inputsAt = request.Inputs ? subscribedAt : double.NegativeInfinity;
                    wiring = request.Wiring;
                    sequence = request.Sequence;
                    releases.AddRange(request.Releases);
                }
            }
            if (request.Fields != null) stream.Subscribe(request.Fields);
            if (changed) nudge?.Invoke();
        }
    }
}
