#!/usr/bin/env python3
import csv
import sys
import os

def read_csv(filepath):
    with open(filepath, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    return header, rows

def main():
    f1 = sys.argv[1]
    f2 = sys.argv[2]
    mode = sys.argv[3]
    data_dir = os.path.expanduser("~/.pi-chi/data")

    path1 = os.path.join(data_dir, f1)
    path2 = os.path.join(data_dir, f2)

    for p in [path1, path2]:
        if not os.path.exists(p):
            print(f"File not found: {p}")
            sys.exit(1)

    h1, r1 = read_csv(path1)
    h2, r2 = read_csv(path2)

    if mode == 'append':
        print(','.join(h1))
        for row in r1 + r2:
            print(','.join(row))
        print(f"\nAppended: {len(r1)} + {len(r2)} = {len(r1)+len(r2)} rows")

    elif mode == 'join':
        # Join on first column (timestamp)
        dict2 = {row[0]: row[1:] for row in r2}
        merged_header = h1 + h2[1:]
        print(','.join(merged_header))
        matched = 0
        for row in r1:
            key = row[0]
            if key in dict2:
                print(','.join(row + dict2[key]))
                matched += 1
        print(f"\nJoined: {matched} matching timestamps out of {len(r1)}")

    elif mode == 'summary':
        print(f"=== {f1} ===")
        print(f"Columns: {h1}")
        print(f"Rows: {len(r1)}")
        for i, col in enumerate(h1):
            vals = []
            for row in r1:
                try: vals.append(float(row[i]))
                except: pass
            if vals:
                print(f"  {col}: min={min(vals):.2f} max={max(vals):.2f} avg={sum(vals)/len(vals):.2f}")

        print(f"\n=== {f2} ===")
        print(f"Columns: {h2}")
        print(f"Rows: {len(r2)}")
        for i, col in enumerate(h2):
            vals = []
            for row in r2:
                try: vals.append(float(row[i]))
                except: pass
            if vals:
                print(f"  {col}: min={min(vals):.2f} max={max(vals):.2f} avg={sum(vals)/len(vals):.2f}")

if __name__ == "__main__":
    main()
