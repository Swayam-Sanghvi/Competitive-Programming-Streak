"""Chrome native messaging host for Competitive Programming Streak (macOS).

Chrome starts this script when the extension asks which desktop app is in front, so time spent in
Python IDLE can count toward the daily goal. It only reports the front app's name and bundle ID;
it never reads window contents or keystrokes.

Protocol: each message is a 4-byte native-endian length followed by that many bytes of UTF-8 JSON,
on stdin (requests) and stdout (replies).
"""
import json
import re
import struct
import subprocess
import sys

VERSION = 1


def read_message():
    header = sys.stdin.buffer.read(4)
    if len(header) < 4:
        return None
    (length,) = struct.unpack("@I", header)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def send_message(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(data)) + data)
    sys.stdout.buffer.flush()


def lsappinfo(*args):
    return subprocess.run(["/usr/bin/lsappinfo", *args], capture_output=True, text=True, timeout=3).stdout


def frontmost_app():
    asn = lsappinfo("front").strip()
    if not asn.startswith("ASN:"):
        return {"name": None, "bundleId": None}
    # `-only name` prints e.g.  "IDLE" ASN:0x0-0x68a68a: (in front)
    name = re.match(r'\s*"([^"]*)"\s+ASN:', lsappinfo("info", "-only", "name", asn))
    bundle = re.search(r'bundleID="([^"]*)"', lsappinfo("info", "-only", "bundleid", asn))
    return {"name": name and name.group(1), "bundleId": bundle and bundle.group(1)}


def handle(msg):
    kind = (msg or {}).get("type")
    if kind == "ping":
        return {"ok": True, "version": VERSION}
    if kind == "frontmost":
        return {"ok": True, **frontmost_app()}
    return {"ok": False, "error": f"unknown request: {kind!r}"}


def main():
    while True:
        msg = read_message()
        if msg is None:
            return
        try:
            send_message(handle(msg))
        except Exception as err:  # report instead of crashing so the extension sees why
            send_message({"ok": False, "error": str(err)})


if __name__ == "__main__":
    main()
