#!/usr/bin/env python3
import sys
import json

def main():
    pin = int(sys.argv[1])
    sensor_type = sys.argv[2].upper()

    if sensor_type not in ('DHT11', 'DHT22'):
        print("Error: sensor_type must be DHT11 or DHT22")
        sys.exit(1)

    try:
        import adafruit_dht
        import board

        # Map BCM pin number to board pin
        pin_map = {
            4: board.D4, 17: board.D17, 18: board.D18, 22: board.D22,
            23: board.D23, 24: board.D24, 25: board.D25, 27: board.D27,
            5: board.D5, 6: board.D6, 12: board.D12, 13: board.D13,
            16: board.D16, 19: board.D19, 20: board.D20, 21: board.D21,
            26: board.D26,
        }

        board_pin = pin_map.get(pin)
        if not board_pin:
            print(f"Error: GPIO {pin} not in supported pin map")
            sys.exit(1)

        if sensor_type == 'DHT22':
            sensor = adafruit_dht.DHT22(board_pin)
        else:
            sensor = adafruit_dht.DHT11(board_pin)

        # Retry up to 3 times (DHT sensors are flaky)
        for attempt in range(3):
            try:
                temp_c = sensor.temperature
                humidity = sensor.humidity
                if temp_c is not None and humidity is not None:
                    temp_f = temp_c * 9.0 / 5.0 + 32.0
                    result = {
                        "sensor": sensor_type,
                        "pin": pin,
                        "temperature_c": round(temp_c, 1),
                        "temperature_f": round(temp_f, 1),
                        "humidity_pct": round(humidity, 1),
                    }
                    print(json.dumps(result, indent=2))
                    sensor.exit()
                    return
            except RuntimeError:
                import time
                time.sleep(2)

        sensor.exit()
        print("Error: Failed to read sensor after 3 attempts")
        sys.exit(1)

    except ImportError:
        print("Error: adafruit_dht library not installed.")
        print("Install: pip3 install adafruit-circuitpython-dht")
        print("Also: sudo apt install libgpiod2")
        sys.exit(1)

if __name__ == "__main__":
    main()
