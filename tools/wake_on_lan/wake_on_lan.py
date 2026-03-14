#!/usr/bin/env python3
import socket
import sys

def main():
    mac = sys.argv[1].replace(':', '').replace('-', '').upper()

    if len(mac) != 12:
        print(f"Error: Invalid MAC address. Got {len(mac)} hex chars, need 12")
        sys.exit(1)

    try:
        mac_bytes = bytes.fromhex(mac)
    except ValueError:
        print("Error: MAC address contains invalid hex characters")
        sys.exit(1)

    # Magic packet: 6x 0xFF + 16x MAC address
    magic = b'\xff' * 6 + mac_bytes * 16

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.sendto(magic, ('255.255.255.255', 9))
    sock.close()

    formatted_mac = ':'.join(mac[i:i+2] for i in range(0, 12, 2))
    print(f"Wake-on-LAN magic packet sent to {formatted_mac}")
    print("Target should wake within 5-30 seconds if WoL is enabled")

if __name__ == "__main__":
    main()
