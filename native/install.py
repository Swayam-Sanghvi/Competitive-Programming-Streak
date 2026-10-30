"""Register the desktop helper with your browser so the extension can count time in Python IDLE.

Usage:
    python3 native/install.py <extension-id>    # ID is on the extension's card on the extensions page
    python3 native/install.py --uninstall
"""
import json
import re
import shlex
import shutil
import sys
from pathlib import Path

HOST_NAME = "com.competitive_programming_streak.desktop"
HERE = Path(__file__).resolve().parent
SUPPORT = Path.home() / "Library/Application Support"
# macOS blocks browser-launched programs from reading Documents/Desktop/Downloads, so the helper is
# copied here instead of running from the project folder.
INSTALL_DIR = SUPPORT / "CompetitiveProgrammingStreak"

# Each Chromium browser looks for native messaging hosts in its own profile folder.
BROWSERS = {
    "Google Chrome": SUPPORT / "Google/Chrome",
    "Arc": SUPPORT / "Arc/User Data",
    "Brave": SUPPORT / "BraveSoftware/Brave-Browser",
    "Microsoft Edge": SUPPORT / "Microsoft Edge",
    "Chromium": SUPPORT / "Chromium",
}


def manifest_path(profile_dir):
    return profile_dir / "NativeMessagingHosts" / f"{HOST_NAME}.json"


def main(argv):
    if sys.platform != "darwin":
        sys.exit("The desktop helper only supports macOS for now.")

    if argv[1:] == ["--uninstall"]:
        for name, profile in BROWSERS.items():
            if manifest_path(profile).exists():
                manifest_path(profile).unlink()
                print(f"Removed from {name}")
        shutil.rmtree(INSTALL_DIR, ignore_errors=True)
        return

    if len(argv) != 2 or not re.fullmatch(r"[a-p]{32}", argv[1]):
        sys.exit(__doc__)

    installed = {name: profile for name, profile in BROWSERS.items() if profile.is_dir()}
    if not installed:
        sys.exit("No supported browser profile found (Chrome, Arc, Brave, Edge, Chromium).")

    INSTALL_DIR.mkdir(exist_ok=True)
    host = INSTALL_DIR / "desktop_host.py"
    shutil.copyfile(HERE / "desktop_host.py", host)
    (HERE / "run_host.sh").unlink(missing_ok=True)  # left by older versions of this installer

    # Browsers launch hosts with a minimal PATH, so pin the Python that ran this installer.
    launcher = INSTALL_DIR / "run_host.sh"
    launcher.write_text(f"#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(host))}\n")
    launcher.chmod(0o755)

    manifest = {
        "name": HOST_NAME,
        "description": "Competitive Programming Streak desktop helper",
        "path": str(launcher),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{argv[1]}/"],
    }
    for name, profile in installed.items():
        manifest_path(profile).parent.mkdir(exist_ok=True)
        manifest_path(profile).write_text(json.dumps(manifest, indent=2))
        print(f"Installed for {name}")
    print(f"Helper copied to {INSTALL_DIR}. Re-run this after changing native/desktop_host.py.")
    print("Click 'Check again' in the dashboard.")


if __name__ == "__main__":
    main(sys.argv)
