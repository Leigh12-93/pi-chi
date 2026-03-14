#!/usr/bin/env python3
import sys
import time

def main():
    pin = int(sys.argv[1])
    duty_cycle = float(sys.argv[2])
    frequency = float(sys.argv[3])
    duration_ms = float(sys.argv[4])

    if duty_cycle < 0 or duty_cycle > 100:
        print("Error: duty_cycle must be 0-100")
        sys.exit(1)

    try:
        import RPi.GPIO as GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(pin, GPIO.OUT)

        pwm = GPIO.PWM(pin, frequency)
        pwm.start(duty_cycle)

        duration_s = duration_ms / 1000.0
        print(f"PWM started: pin={pin}, duty={duty_cycle}%, freq={frequency}Hz, duration={duration_ms}ms")
        time.sleep(duration_s)

        pwm.stop()
        GPIO.cleanup(pin)
        print(f"PWM completed on GPIO {pin}")

    except ImportError:
        # Fallback: software PWM via sysfs
        print("RPi.GPIO not available, using software toggle")
        period = 1.0 / frequency
        on_time = period * (duty_cycle / 100.0)
        off_time = period - on_time
        end_time = time.time() + (duration_ms / 1000.0)

        import os
        gpio_path = f"/sys/class/gpio/gpio{pin}"
        os.system(f"echo {pin} > /sys/class/gpio/export 2>/dev/null")
        os.system(f"echo out > {gpio_path}/direction 2>/dev/null")

        cycles = 0
        while time.time() < end_time:
            os.system(f"echo 1 > {gpio_path}/value")
            time.sleep(on_time)
            os.system(f"echo 0 > {gpio_path}/value")
            time.sleep(off_time)
            cycles += 1

        os.system(f"echo {pin} > /sys/class/gpio/unexport 2>/dev/null")
        print(f"Software PWM: {cycles} cycles on GPIO {pin}")

if __name__ == "__main__":
    main()
