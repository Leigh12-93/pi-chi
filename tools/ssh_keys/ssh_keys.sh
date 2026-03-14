#!/bin/bash
ACTION="$1"
USER="$2"
KEY="$3"

HOME_DIR=$(eval echo "~$USER")
AUTH_FILE="$HOME_DIR/.ssh/authorized_keys"

case "$ACTION" in
  list)
    echo "=== SSH Keys for $USER ==="
    if [ -f "$AUTH_FILE" ]; then
      cat "$AUTH_FILE" | awk '{print NR": "$0}'
    else
      echo "No authorized_keys file"
    fi
    echo ""
    echo "--- SSH Config ---"
    grep -E "^(PermitRootLogin|PasswordAuth|PubkeyAuth)" /etc/ssh/sshd_config 2>/dev/null
    ;;
  add)
    mkdir -p "$HOME_DIR/.ssh"
    echo "$KEY" >> "$AUTH_FILE"
    chown -R "$USER:$USER" "$HOME_DIR/.ssh"
    chmod 700 "$HOME_DIR/.ssh"
    chmod 600 "$AUTH_FILE"
    echo "Key added for $USER"
    echo "Total keys: $(wc -l < "$AUTH_FILE")"
    ;;
  remove)
    if [ -f "$AUTH_FILE" ]; then
      BEFORE=$(wc -l < "$AUTH_FILE")
      grep -v "$KEY" "$AUTH_FILE" > "${AUTH_FILE}.tmp"
      mv "${AUTH_FILE}.tmp" "$AUTH_FILE"
      AFTER=$(wc -l < "$AUTH_FILE")
      echo "Removed $((BEFORE - AFTER)) key(s) matching '$KEY'"
    else
      echo "No authorized_keys file"
    fi
    ;;
  generate)
    ssh-keygen -t ed25519 -f "$HOME_DIR/.ssh/id_ed25519" -N "" -C "$USER@$(hostname)" 2>/dev/null
    echo "Generated new Ed25519 keypair for $USER"
    echo "Public key:"
    cat "$HOME_DIR/.ssh/id_ed25519.pub"
    chown -R "$USER:$USER" "$HOME_DIR/.ssh"
    ;;
  *)
    echo "Error: action must be list, add, remove, or generate"
    exit 1
    ;;
esac
