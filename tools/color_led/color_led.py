#!/usr/bin/env python3
import sys
import time

def main():
    pin = int(sys.argv[1])
    r = int(sys.argv[2])
    g = int(sys.argv[3])
    b = int(sys.argv[4])
    count = int(sys.argv[5])

    for v in [r, g, b]:
        if v < 0 or v > 255:
            print("Error: RGB values must be 0-255")
            sys.exit(1)

    try:
        import board
        import neopixel

        pin_map = {
            10: board.D10, 12: board.D12, 18: board.D18, 21: board.D21,
        }
        board_pin = pin_map.get(pin)
        if not board_pin:
            print(f"Error: GPIO {pin} not supported for NeoPixel. Try 10, 12, 18, or 21")
            sys.exit(1)

        pixels = neopixel.NeoPixel(board_pin, count, auto_write=False, brightness=0.5)
        pixels.fill((r, g, b))
        pixels.show()
        print(f"Set {count} LEDs to RGB({r},{g},{b}) on GPIO {pin}")
        print(f"Hex: #{r:02x}{g:02x}{b:02x}")

    except ImportError:
        print("Error: neopixel library not installed")
        print("Install: sudo pip3 install adafruit-circuitpython-neopixel")
        print("Also: sudo pip3 install rpi_ws281x adafruit-circuitpython-pixelbuf")
        sys.exit(1)

if __name__ == "__main__":
    main()
