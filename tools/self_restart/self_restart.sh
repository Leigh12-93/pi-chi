#!/bin/bash
MODE="$1"

case "$MODE" in
  brain)
    echo "Restarting Pi-Chi brain service..."
    sudo systemctl restart pi-chi-brain
    sleep 2
    STATUS=$(systemctl is-active pi-chi-brain)
    echo "Brain service: $STATUS"
    ;;
  reboot)
    echo "Rebooting Pi in 5 seconds..."
    echo "Reason: AI-initiated reboot at $(date)"
    sleep 5
    sudo reboot
    ;;
  shutdown)
    echo "Shutting down Pi in 5 seconds..."
    echo "Reason: AI-initiated shutdown at $(date)"
    sleep 5
    sudo shutdown -h now
    ;;
  *)
    echo "Error: mode must be brain, reboot, or shutdown"
    exit 1
    ;;
esac
