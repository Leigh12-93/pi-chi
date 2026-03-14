#!/bin/bash
ACTION="$1"
FILE="$2"
KEY="$3"
VALUE="$4"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

case "$ACTION" in
  read)
    echo "=== $FILE ==="
    cat "$FILE"
    ;;
  get)
    # Handle .env files
    if echo "$FILE" | grep -qE '\.env$'; then
      grep "^${KEY}=" "$FILE" | cut -d= -f2-
    # Handle JSON files
    elif echo "$FILE" | grep -qE '\.json$'; then
      python3 -c "import json; d=json.load(open('$FILE')); print(json.dumps(d.get('$KEY', 'KEY NOT FOUND'), indent=2))"
    else
      grep "$KEY" "$FILE"
    fi
    ;;
  set)
    # Backup first
    cp "$FILE" "${FILE}.bak"
    echo "Backup: ${FILE}.bak"

    if echo "$FILE" | grep -qE '\.env$'; then
      if grep -q "^${KEY}=" "$FILE"; then
        sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$FILE"
        echo "Updated: $KEY=$VALUE"
      else
        echo "${KEY}=${VALUE}" >> "$FILE"
        echo "Added: $KEY=$VALUE"
      fi
    elif echo "$FILE" | grep -qE '\.json$'; then
      python3 -c "
import json
with open('$FILE','r') as f: d=json.load(f)
d['$KEY']='$VALUE'
with open('$FILE','w') as f: json.dump(d,f,indent=2)
print('Updated $KEY in JSON')
"
    else
      if grep -q "$KEY" "$FILE"; then
        sed -i "s|${KEY}.*|${KEY}=${VALUE}|" "$FILE"
        echo "Updated: $KEY"
      else
        echo "${KEY}=${VALUE}" >> "$FILE"
        echo "Appended: $KEY=$VALUE"
      fi
    fi
    ;;
  *)
    echo "Error: action must be read, get, or set"
    exit 1
    ;;
esac
