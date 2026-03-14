#!/bin/bash
ACTION="$1"
KEY="$2"
VALUE="$3"

CONFIG="/boot/firmware/config.txt"
if [ ! -f "$CONFIG" ]; then
  CONFIG="/boot/config.txt"
fi

case "$ACTION" in
  read)
    echo "=== $CONFIG ==="
    cat "$CONFIG" | grep -v '^#' | grep -v '^$'
    ;;
  get)
    grep "$KEY" "$CONFIG" 2>/dev/null || echo "Key '$KEY' not found in config"
    ;;
  set)
    sudo cp "$CONFIG" "${CONFIG}.bak"
    if grep -q "^${KEY}" "$CONFIG"; then
      sudo sed -i "s|^${KEY}.*|${KEY}=${VALUE}|" "$CONFIG"
      echo "Updated: $KEY=$VALUE"
    elif grep -q "^#${KEY}" "$CONFIG"; then
      sudo sed -i "s|^#${KEY}.*|${KEY}=${VALUE}|" "$CONFIG"
      echo "Uncommented and set: $KEY=$VALUE"
    else
      echo "${KEY}=${VALUE}" | sudo tee -a "$CONFIG" >/dev/null
      echo "Added: $KEY=$VALUE"
    fi
    echo "Backup: ${CONFIG}.bak"
    echo "Reboot needed for changes to take effect"
    ;;
  add)
    echo "$KEY" | sudo tee -a "$CONFIG" >/dev/null
    echo "Added line: $KEY"
    ;;
  *)
    echo "Error: action must be read, get, set, or add"
    exit 1
    ;;
esac
