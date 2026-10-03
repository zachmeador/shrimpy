#!/usr/bin/env python3
"""Run a command in a pseudo-terminal, type scripted keystrokes, and record what it prints.

  pty-drive.py --out capture.json --steps '[[2.0, "hello\\r"], [5.0, "\\u0003"]]' -- node src/cli.ts tui ...

Each step is [seconds after the previous step, text to type]. The capture holds every output chunk with its
timestamp, so scripts/render-capture.ts can replay it into a terminal emulator and print the screen at any moment.
"""
import argparse
import base64
import fcntl
import json
import os
import pty
import select
import struct
import subprocess
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument("--cols", type=int, default=100)
parser.add_argument("--rows", type=int, default=34)
parser.add_argument("--out", required=True)
parser.add_argument("--steps", default="[]")
parser.add_argument("--tail", type=float, default=2.0, help="seconds to keep recording after the last step")
parser.add_argument("--timeout", type=float, default=120.0)
parser.add_argument("cmd", nargs=argparse.REMAINDER)
args = parser.parse_args()
cmd = args.cmd[1:] if args.cmd and args.cmd[0] == "--" else args.cmd
steps = json.loads(args.steps)

master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", args.rows, args.cols, 0, 0))
env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor", "COLUMNS": str(args.cols), "LINES": str(args.rows)}
child = subprocess.Popen(
    cmd,
    stdin=slave,
    stdout=slave,
    stderr=slave,
    env=env,
    start_new_session=True,
    close_fds=True,
    preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0),
)
os.close(slave)

start = time.monotonic()
chunks = []
sent = []
schedule = []
at = 0.0
for delay, text in steps:
    at += delay
    schedule.append((at, text))
end_at = (schedule[-1][0] if schedule else 0.0) + args.tail
pending = list(schedule)
exit_code = None
while True:
    now = time.monotonic() - start
    while pending and now >= pending[0][0]:
        _, text = pending.pop(0)
        os.write(master, text.encode())
        sent.append({"t": round(now, 3), "text": text})
    if now > args.timeout:
        child.kill()
        exit_code = "timeout"
        break
    readable, _, _ = select.select([master], [], [], 0.02)
    if readable:
        try:
            data = os.read(master, 65536)
        except OSError:
            data = b""
        if data:
            chunks.append({"t": round(time.monotonic() - start, 3), "data": base64.b64encode(data).decode()})
    code = child.poll()
    if code is not None:
        exit_code = code
        # drain whatever is left
        while select.select([master], [], [], 0.05)[0]:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            chunks.append({"t": round(time.monotonic() - start, 3), "data": base64.b64encode(data).decode()})
        break
    if not pending and now > end_at:
        child.terminate()
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            child.kill()
        exit_code = "terminated-after-script"
        break

with open(args.out, "w") as handle:
    json.dump({"cols": args.cols, "rows": args.rows, "cmd": cmd, "steps": sent, "exit": exit_code, "chunks": chunks}, handle)
print(json.dumps({"exit": exit_code, "chunks": len(chunks), "seconds": round(time.monotonic() - start, 2), "out": args.out}))
