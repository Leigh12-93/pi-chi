#!/usr/bin/env python3
"""
CEC Remote → Keyboard Bridge for Pi-Chi Kiosk

Translates HDMI-CEC remote button presses to keyboard events
using python-evdev uinput (kernel-level, works with Cage/Wayland).

Install deps: sudo apt install -y cec-utils python3-evdev
Systemd: pi-chi-cec.service
"""

import subprocess
import sys
import time
import re

try:
    import evdev
    from evdev import UInput, ecodes
except ImportError:
    print("ERROR: python3-evdev not found. Install with: sudo apt install -y python3-evdev")
    sys.exit(1)

# ── Key mappings: CEC key name → evdev keycode ──

KEY_MAP = {
    "up":           ecodes.KEY_UP,
    "down":         ecodes.KEY_DOWN,
    "left":         ecodes.KEY_LEFT,
    "right":        ecodes.KEY_RIGHT,
    "select":       ecodes.KEY_ENTER,
    "enter":        ecodes.KEY_ENTER,
    "exit":         ecodes.KEY_ESC,
    "back":         ecodes.KEY_ESC,
    "play":         ecodes.KEY_SPACE,
    "pause":        ecodes.KEY_SPACE,
    "stop":         ecodes.KEY_SPACE,
    "channel up":   ecodes.KEY_TAB,
    "channel down": ecodes.KEY_TAB,  # Will use shift modifier
    "F1":           ecodes.KEY_1,    # Red → Ctrl+1
    "red":          ecodes.KEY_1,
    "F2":           ecodes.KEY_6,    # Green → Ctrl+6
    "green":        ecodes.KEY_6,
    "blue":         ecodes.KEY_7,    # Blue → Ctrl+7
    "F5":           ecodes.KEY_7,
    "yellow":       ecodes.KEY_8,    # Yellow → Ctrl+8
    "F4":           ecodes.KEY_8,
}

# Keys that need Ctrl modifier
CTRL_KEYS = {"F1", "red", "F2", "green", "blue", "F5", "yellow", "F4"}

# Keys that need Shift modifier
SHIFT_KEYS = {"channel down"}

# Debounce settings
DEBOUNCE_MS = 200
last_key = ""
last_time = 0.0


def send_key(ui: UInput, keycode: int, ctrl: bool = False, shift: bool = False):
    """Send a key press/release via uinput with optional modifiers."""
    global last_key, last_time

    now = time.monotonic() * 1000
    key_id = f"{keycode}:{ctrl}:{shift}"

    if key_id == last_key and (now - last_time) < DEBOUNCE_MS:
        return

    last_key = key_id
    last_time = now

    try:
        # Press modifiers
        if ctrl:
            ui.write(ecodes.EV_KEY, ecodes.KEY_LEFTCTRL, 1)
            ui.syn()
        if shift:
            ui.write(ecodes.EV_KEY, ecodes.KEY_LEFTSHIFT, 1)
            ui.syn()

        # Press and release key
        ui.write(ecodes.EV_KEY, keycode, 1)
        ui.syn()
        time.sleep(0.02)
        ui.write(ecodes.EV_KEY, keycode, 0)
        ui.syn()

        # Release modifiers
        if shift:
            ui.write(ecodes.EV_KEY, ecodes.KEY_LEFTSHIFT, 0)
            ui.syn()
        if ctrl:
            ui.write(ecodes.EV_KEY, ecodes.KEY_LEFTCTRL, 0)
            ui.syn()
    except Exception as e:
        print(f"uinput write failed: {e}", flush=True)


def main():
    # Verify cec-client
    try:
        subprocess.run(["cec-client", "--help"], capture_output=True, timeout=5)
    except FileNotFoundError:
        print("ERROR: cec-client not found. Install with: sudo apt install -y cec-utils")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        pass

    # Create virtual keyboard via uinput
    all_keys = list(set(KEY_MAP.values()) | {ecodes.KEY_LEFTCTRL, ecodes.KEY_LEFTSHIFT})
    cap = {ecodes.EV_KEY: all_keys}

    try:
        ui = UInput(cap, name="pi-chi-cec-remote", bustype=ecodes.BUS_USB)
    except PermissionError:
        print("ERROR: Cannot create uinput device. Run as root or add user to 'input' group.")
        print("  sudo usermod -aG input pi")
        sys.exit(1)

    print("Pi-Chi CEC Remote Bridge", flush=True)
    print(f"  uinput device: {ui.device.path}", flush=True)
    print("  Listening for CEC events on /dev/cec0...", flush=True)

    # Pattern to match CEC key events
    key_pattern = re.compile(r"key pressed:\s*(.+?)(?:\s*\(|$)")

    # Start cec-client
    proc = subprocess.Popen(
        ["cec-client", "-d", "8"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    try:
        for line in proc.stdout:
            line = line.strip()
            match = key_pattern.search(line)
            if not match:
                continue

            cec_key = match.group(1).strip().lower()
            keycode = KEY_MAP.get(cec_key)

            if keycode is None:
                print(f"Unhandled CEC key: {cec_key}", flush=True)
                continue

            ctrl = cec_key in {k.lower() for k in CTRL_KEYS}
            shift = cec_key in {k.lower() for k in SHIFT_KEYS}

            print(f"CEC: {cec_key} → keycode {keycode} (ctrl={ctrl})", flush=True)
            send_key(ui, keycode, ctrl=ctrl, shift=shift)

    except KeyboardInterrupt:
        print("\nStopping CEC bridge.", flush=True)
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        ui.close()


if __name__ == "__main__":
    main()
