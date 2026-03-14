#!/usr/bin/env python3
import re
import sys

def main():
    pattern = sys.argv[1]
    text = sys.argv[2]

    print(f"Pattern: {pattern}")
    print(f"Text: {text}")
    print()

    try:
        compiled = re.compile(pattern)
    except re.error as e:
        print(f"Invalid regex: {e}")
        sys.exit(1)

    matches = list(compiled.finditer(text))
    if not matches:
        print("No matches found")
        sys.exit(0)

    print(f"Matches: {len(matches)}")
    for i, m in enumerate(matches):
        print(f"\n  Match {i+1}: '{m.group()}' at position {m.start()}-{m.end()}")
        if m.groups():
            for j, g in enumerate(m.groups(), 1):
                print(f"    Group {j}: '{g}'")
        if m.groupdict():
            for name, val in m.groupdict().items():
                print(f"    Named '{name}': '{val}'")

    # Show full match replacement preview
    print(f"\nfindall: {compiled.findall(text)}")

if __name__ == "__main__":
    main()
