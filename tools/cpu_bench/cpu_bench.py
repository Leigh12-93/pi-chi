#!/usr/bin/env python3
import time
import math
import hashlib

def bench_math(iterations=100000):
    start = time.time()
    for i in range(iterations):
        math.sqrt(i * 3.14159)
        math.sin(i)
        math.cos(i)
    return time.time() - start

def bench_hash(iterations=50000):
    start = time.time()
    data = b"Pi-Chi benchmark test data string"
    for i in range(iterations):
        hashlib.sha256(data + str(i).encode()).hexdigest()
    return time.time() - start

def bench_string(iterations=100000):
    start = time.time()
    for i in range(iterations):
        s = "test" * 100
        s = s.upper().lower().replace("test", "bench")
    return time.time() - start

def main():
    print("=== Pi-Chi CPU Benchmark ===")
    print(f"CPU: {open('/proc/cpuinfo').read().split('model name')[1].split(chr(10))[0].strip(': ') if 'model name' in open('/proc/cpuinfo').read() else 'ARM'}")
    print(f"Cores: {__import__('os').cpu_count()}")
    print()

    print("Running benchmarks...")
    math_time = bench_math()
    hash_time = bench_hash()
    string_time = bench_string()
    total = math_time + hash_time + string_time

    print(f"\n--- Results ---")
    print(f"Math (100K ops):   {math_time:.3f}s")
    print(f"SHA256 (50K ops):  {hash_time:.3f}s")
    print(f"String (100K ops): {string_time:.3f}s")
    print(f"Total:             {total:.3f}s")

    print(f"\n--- Reference Scores ---")
    print(f"Pi Zero 2W: ~4.5s")
    print(f"Pi 4B:      ~2.0s")
    print(f"Pi 5:       ~1.0s")
    print(f"Your score: {total:.3f}s {'(faster is better)' if total < 5 else '(consider Pi 5 upgrade)'}")

if __name__ == "__main__":
    main()
