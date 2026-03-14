#!/usr/bin/env python3
import csv
import sys
import os

def main():
    filename = sys.argv[1]
    rows_limit = int(sys.argv[2])
    filepath = os.path.join(os.path.expanduser("~"), ".pi-chi", "data", filename)

    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    with open(filepath, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        all_rows = list(reader)

    if rows_limit > 0:
        data = all_rows[-rows_limit:]
    else:
        data = all_rows

    if not data:
        print("No data rows found")
        sys.exit(0)

    print(f"=== {filename} ({len(data)} rows) ===")
    print(f"Columns: {', '.join(header)}")
    print()

    # Show last 5 rows
    print("--- Recent Data ---")
    print(','.join(header))
    for row in data[-5:]:
        print(','.join(row))
    print()

    # Compute stats for numeric columns (skip timestamp col 0)
    print("--- Statistics ---")
    for i, col_name in enumerate(header):
        if i == 0 and 'time' in col_name.lower():
            continue
        vals = []
        for row in data:
            if i < len(row):
                try:
                    vals.append(float(row[i]))
                except ValueError:
                    pass
        if vals:
            print(f"{col_name}: min={min(vals):.2f}  max={max(vals):.2f}  avg={sum(vals)/len(vals):.2f}  latest={vals[-1]:.2f}")

    # Time range
    if data and 'time' in header[0].lower():
        print(f"\nTime range: {data[0][0]} to {data[-1][0]}")

if __name__ == "__main__":
    main()
