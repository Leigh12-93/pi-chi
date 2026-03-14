#!/bin/bash
SETTING="$1"
VALUE="$2"

case "$SETTING" in
  i2c)
    if [ "$VALUE" = "enable" ]; then
      sudo raspi-config nonint do_i2c 0 2>/dev/null
      echo "I2C enabled (reboot may be needed)"
    else
      sudo raspi-config nonint do_i2c 1 2>/dev/null
      echo "I2C disabled"
    fi
    ;;
  spi)
    if [ "$VALUE" = "enable" ]; then
      sudo raspi-config nonint do_spi 0 2>/dev/null
      echo "SPI enabled"
    else
      sudo raspi-config nonint do_spi 1 2>/dev/null
      echo "SPI disabled"
    fi
    ;;
  camera)
    if [ "$VALUE" = "enable" ]; then
      sudo raspi-config nonint do_camera 0 2>/dev/null
      echo "Camera enabled"
    else
      sudo raspi-config nonint do_camera 1 2>/dev/null
      echo "Camera disabled"
    fi
    ;;
  serial)
    if [ "$VALUE" = "enable" ]; then
      sudo raspi-config nonint do_serial_hw 0 2>/dev/null
      echo "Serial hardware enabled"
    else
      sudo raspi-config nonint do_serial_hw 1 2>/dev/null
      echo "Serial hardware disabled"
    fi
    ;;
  ssh)
    if [ "$VALUE" = "enable" ]; then
      sudo raspi-config nonint do_ssh 0 2>/dev/null
      echo "SSH enabled"
    else
      sudo raspi-config nonint do_ssh 1 2>/dev/null
      echo "SSH disabled"
    fi
    ;;
  gpu_mem)
    sudo raspi-config nonint do_memory_split "$VALUE" 2>/dev/null
    echo "GPU memory set to ${VALUE}MB"
    ;;
  wifi_country)
    sudo raspi-config nonint do_wifi_country "$VALUE" 2>/dev/null
    echo "WiFi country set to $VALUE"
    ;;
  status)
    echo "=== Raspberry Pi Configuration ==="
    echo "I2C: $(sudo raspi-config nonint get_i2c 2>/dev/null && echo disabled || echo enabled)"
    echo "SPI: $(sudo raspi-config nonint get_spi 2>/dev/null && echo disabled || echo enabled)"
    echo "SSH: $(sudo raspi-config nonint get_ssh 2>/dev/null && echo disabled || echo enabled)"
    echo "Camera: $(sudo raspi-config nonint get_camera 2>/dev/null && echo disabled || echo enabled)"
    echo "GPU Memory: $(vcgencmd get_mem gpu 2>/dev/null | sed 's/gpu=//')"
    echo "WiFi Country: $(sudo raspi-config nonint get_wifi_country 2>/dev/null)"
    echo ""
    echo "--- /boot/firmware/config.txt ---"
    grep -v '^#' /boot/firmware/config.txt 2>/dev/null | grep -v '^$' | head -20 || grep -v '^#' /boot/config.txt 2>/dev/null | grep -v '^$' | head -20
    ;;
  *)
    echo "Error: setting must be i2c, spi, camera, serial, ssh, gpu_mem, wifi_country, or status"
    exit 1
    ;;
esac
