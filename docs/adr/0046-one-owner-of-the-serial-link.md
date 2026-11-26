# ADR 0046: One Owner of the Serial Link

Status: Accepted. The wire gains only an empty line before each request, which
every firmware already accepts.

## Context

The configurator shares one serial link between the `@PR:INFO` poll, single
commands such as a live `@PR:APPLY`, actions of many steps such as Save to
board, Update board, an upload, a restart or a connection, the debugger's bench
and the telemetry relay. Each kept a guard of its own: two flags in the runner,
the connection status, a flag in every asset service, in Update board, in the
first install and in the bench, and the bench poller's holds. Each path checked
a different subset, most refused instead of waiting, and Save and Update board
read the board before they had the link, so fixing one collision moved it to the
next. The board answers one command at a time
([control-protocol.md](../control-protocol.md)), yet a timeout, a busy answer
and a refusal reached the caller as the same error code.

## Decision

**One owner holds the link.** `LinkOwner` (`main/device/link-owner.ts`) gives
every user of the port a turn, and nothing else writes to it:

| Starts | Link free | Poll running | Command running | Operation running or waiting |
| --- | --- | --- | --- | --- |
| poll (`INFO`, `DIAG`) | runs | waits behind it | skips | skips |
| command (one request, one answer) | runs | waits; the poll stops at its next request | waits its turn | refused, naming the operation |
| operation (Save, Update board, install, upload, restart, connect, disconnect, bench pattern) | runs | waits; the poll stops | waits its turn | refused, naming the operation |
| telemetry write | sent | dropped | dropped | dropped |

A command or operation started inside a turn is one of its steps: it runs at
once, steps started together reach the port one after another, and a turn keeps
the link until the steps started in it have ended. A call made after its turn's
own work ended counts as an outside call. Nothing inside a turn may wait for the
link to come free, through `whenIdle()`, a poll or a call queued behind the
turn, because the turn waits for it. An `AsyncLocalStorage` scope tells a step
from a caller outside. The running or
waiting operation is `DeviceState.activity`, so the interface disables what
would be refused and says why, and a language restart or an app update install
waits for it to end. Cancel stops the reconnect of a connection or of a plain
restart; inside any other operation it is refused, because that operation needs
the board back. Telemetry writes go through the owner, which lets those already
in flight finish before a turn writes.

**Decide on the turn.** An operation reads the board when its turn starts and
again after each restart. Save to board downloads missing fonts before it asks
for the link, because the port must not wait for the network, and plans again
on its turn when the board changed in between.

**One answer model.** A request ends as its answer, a refusal with the board's
token, `board_busy` after its retries, `no_answer`, `serial_error` when the port
is lost, or `damaged_reply`, and `DeviceError` keeps the token across IPC. Every
request starts on a fresh line, takes only lines that arrive after it is
written, and ignores an error under another command's namespace, except the
`busy` that the upload owning the stream sends under its own. A busy answer,
`<TAG>:busy` included, is retried with growing gaps for the request's busy
window, each attempt with its full time to answer. A `@PR:SET` left without an
answer is checked against the document's generation in `@PR:INFO`.

**Only the device folder reaches the port.** An ESLint rule keeps `serialport`
and the request modules inside `src/main/device/` and `src/main/first-install/`.

## Consequences

- An action that starts while another runs either waits a few seconds or is
  refused at once with the other's name; none writes between another's steps.
- Older firmware that does not finish `@PR:VALIDATE` is offered Update board
  with a text that says so; a refusal reads as a refusal and a busy board as
  busy.
- Every firmware and plugin release works with this configurator as before.
- A board that restarts on its own while its port stays open, as the CH340 of
  the Guition ESP32-4848S040 does, is still not noticed: `@PR:INFO` reports no
  uptime or boot identity, and adding one is a firmware change of its own.
