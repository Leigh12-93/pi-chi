#!/usr/bin/env python3
import json
import sys

def navigate(data, query):
    if query == 'keys':
        if isinstance(data, dict):
            return list(data.keys())
        return f"Not a dict (type: {type(data).__name__})"
    if query == 'length':
        return len(data) if hasattr(data, '__len__') else 1
    if query == 'type':
        return type(data).__name__
    if query == 'pretty':
        return json.dumps(data, indent=2)

    parts = query.replace('[', '.[').split('.')
    current = data
    for part in parts:
        if not part:
            continue
        if part.startswith('[') and part.endswith(']'):
            idx = int(part[1:-1])
            current = current[idx]
        elif isinstance(current, dict):
            current = current[part]
        elif isinstance(current, list):
            current = [item.get(part) if isinstance(item, dict) else None for item in current]
        else:
            return f"Cannot navigate into {type(current).__name__} with '{part}'"
    return current

def main():
    filepath = sys.argv[1]
    query = sys.argv[2]

    with open(filepath, 'r') as f:
        data = json.load(f)

    result = navigate(data, query)
    if isinstance(result, (dict, list)):
        print(json.dumps(result, indent=2, default=str))
    else:
        print(result)

if __name__ == "__main__":
    main()
