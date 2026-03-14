#!/usr/bin/env python3
import sys
import os

def main():
    text = sys.argv[1]
    output = sys.argv[2]

    try:
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=1, border=1)
        qr.add_data(text)
        qr.make(fit=True)

        if output == 'ascii':
            # Print as ASCII art
            matrix = qr.get_matrix()
            for row in matrix:
                line = ''
                for cell in row:
                    line += '##' if cell else '  '
                print(line)
            print(f"\nEncoded: {text}")
        else:
            data_dir = os.path.expanduser("~/.pi-chi/data")
            os.makedirs(data_dir, exist_ok=True)
            filepath = os.path.join(data_dir, output)
            img = qr.make_image(fill_color="black", back_color="white")
            img.save(filepath)
            print(f"QR code saved to: {filepath}")
            print(f"Size: {os.path.getsize(filepath)} bytes")
            print(f"Encoded: {text}")

    except ImportError:
        # Fallback: use qrencode CLI
        if output == 'ascii':
            os.system(f"qrencode -t ANSIUTF8 '{text}' 2>/dev/null || echo 'Install: pip3 install qrcode[pil] or sudo apt install qrencode'")
        else:
            data_dir = os.path.expanduser("~/.pi-chi/data")
            os.makedirs(data_dir, exist_ok=True)
            filepath = os.path.join(data_dir, output)
            ret = os.system(f"qrencode -o '{filepath}' '{text}' 2>/dev/null")
            if ret == 0:
                print(f"QR code saved to: {filepath}")
            else:
                print("Install: pip3 install qrcode[pil] or sudo apt install qrencode")

if __name__ == "__main__":
    main()
