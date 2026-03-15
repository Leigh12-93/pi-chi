#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Pi-Chi — Raspberry Pi Setup Script
#
# Run on a fresh Raspberry Pi 4 (2GB) with Raspberry Pi OS:
#   curl -fsSL https://raw.githubusercontent.com/Leigh12-93/pi-chi/main/scripts/pi-setup.sh | bash
#   — or —
#   bash ~/pi-chi/scripts/pi-setup.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[pi-chi]${NC} $1"; }
warn() { echo -e "${YELLOW}[pi-chi]${NC} $1"; }
err()  { echo -e "${RED}[pi-chi]${NC} $1"; }

PI_USER="${USER:-pi}"
PI_HOME="${HOME:-/home/pi}"
REPO_DIR="$PI_HOME/pi-chi"
STATE_DIR="$PI_HOME/.pi-chi"

# ── 1. System update ─────────────────────────────────────────────

log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Install Node.js 20 LTS ────────────────────────────────────

if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* && "$(node -v)" != v22* ]]; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js $(node -v) already installed"
fi

# ── 3. Install system dependencies ───────────────────────────────

log "Installing system dependencies..."
sudo apt-get install -y -qq git python3 python3-evdev build-essential cage chromium-browser cec-utils curl

# ── 4. Clone or update repo ──────────────────────────────────────

if [ -d "$REPO_DIR/.git" ]; then
  log "Updating existing repo..."
  cd "$REPO_DIR"
  git pull --ff-only
else
  log "Cloning pi-chi..."
  git clone https://github.com/Leigh12-93/pi-chi.git "$REPO_DIR"
  cd "$REPO_DIR"
fi

# ── 5. Install npm dependencies ──────────────────────────────────

log "Installing npm packages..."
npm ci --production=false

# ── 6. Create .env.local template ────────────────────────────────

if [ ! -f "$REPO_DIR/.env.local" ]; then
  log "Creating .env.local template..."
  cat > "$REPO_DIR/.env.local" << 'ENVEOF'
# Pi-Chi Environment Variables
# Fill in your API keys before starting the brain

# Required — Claude API
ANTHROPIC_API_KEY=

# Optional — Brave Search (enables web_search tool)
BRAVE_SEARCH_API_KEY=

# Optional — SMS gateway
SMS_GATEWAY_SCRIPT=/home/pi/scripts/sms.sh
# SMS_GATEWAY_URL=https://your-sms-gateway.example.com/send

# Optional — Cost controls
BRAIN_DAILY_BUDGET=10

# Dashboard (for Supabase-backed features)
# NEXT_PUBLIC_SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
ENVEOF
  warn "IMPORTANT: Edit .env.local and add your ANTHROPIC_API_KEY"
else
  log ".env.local already exists"
fi

# ── 7. Build dashboard ───────────────────────────────────────────

log "Building Next.js dashboard..."
npm run build

# ── 8. Create state directory ────────────────────────────────────

mkdir -p "$STATE_DIR"
log "Brain state directory: $STATE_DIR"

# ── 9. Create systemd services ───────────────────────────────────

log "Creating systemd services..."

# Brain service
sudo tee /etc/systemd/system/pi-chi-brain.service > /dev/null << SVCEOF
[Unit]
Description=Pi-Chi Autonomous Brain
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$PI_USER
WorkingDirectory=$REPO_DIR
EnvironmentFile=$REPO_DIR/.env.local
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/npx tsx scripts/pi-brain.ts
Restart=always
RestartSec=30
MemoryMax=512M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pi-chi-brain

[Install]
WantedBy=multi-user.target
SVCEOF

# Dashboard service
sudo tee /etc/systemd/system/pi-chi-dashboard.service > /dev/null << SVCEOF
[Unit]
Description=Pi-Chi Dashboard (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$PI_USER
WorkingDirectory=$REPO_DIR
EnvironmentFile=$REPO_DIR/.env.local
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
MemoryMax=1024M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pi-chi-dashboard

[Install]
WantedBy=multi-user.target
SVCEOF

# Kiosk service
sudo install -m 755 "$REPO_DIR/scripts/start-kiosk.sh" /usr/local/bin/pi-chi-start-kiosk
sudo install -m 755 "$REPO_DIR/scripts/standby-screen.sh" /usr/local/bin/pi-chi-standby-screen
sudo tee /etc/systemd/system/pi-chi-kiosk.service > /dev/null << SVCEOF
[Unit]
Description=Pi-Chi HDMI Kiosk
After=systemd-user-sessions.service network-online.target pi-chi-dashboard.service
Wants=network-online.target pi-chi-dashboard.service

[Service]
Type=simple
User=$PI_USER
WorkingDirectory=$REPO_DIR
Environment=HOME=$PI_HOME
Environment=PI_CHI_DASHBOARD_URL=http://127.0.0.1:3333
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal
ExecStart=/usr/local/bin/pi-chi-start-kiosk
Restart=always
RestartSec=5
SyslogIdentifier=pi-chi-kiosk

[Install]
WantedBy=multi-user.target
SVCEOF

# Standby screen service
sudo tee /etc/systemd/system/pi-chi-standby.service > /dev/null << SVCEOF
[Unit]
Description=Pi-Chi Standby Screen
After=systemd-user-sessions.service

[Service]
Type=simple
User=$PI_USER
WorkingDirectory=$PI_HOME
Environment=HOME=$PI_HOME
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty
StandardOutput=tty
StandardError=journal
ExecStart=/usr/local/bin/pi-chi-standby-screen
Restart=always
RestartSec=2
SyslogIdentifier=pi-chi-standby

[Install]
WantedBy=multi-user.target
SVCEOF

# CEC bridge service
sudo tee /etc/systemd/system/pi-chi-cec.service > /dev/null << SVCEOF
[Unit]
Description=Pi-Chi CEC Remote Bridge
After=pi-chi-kiosk.service
Wants=pi-chi-kiosk.service
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=root
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/python3 $REPO_DIR/scripts/cec-remote.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

# ── 10. Enable and start services ────────────────────────────────

sudo systemctl daemon-reload
sudo systemctl set-default multi-user.target
sudo systemctl disable --now lightdm.service 2>/dev/null || true
echo uinput | sudo tee /etc/modules-load.d/pi-chi-uinput.conf > /dev/null
sudo modprobe uinput 2>/dev/null || true
sudo systemctl enable pi-chi-dashboard.service
sudo systemctl enable pi-chi-brain.service
sudo systemctl enable pi-chi-kiosk.service
sudo systemctl enable pi-chi-cec.service
sudo systemctl disable pi-chi-standby.service 2>/dev/null || true

# Start dashboard immediately
sudo systemctl start pi-chi-dashboard.service
log "Dashboard started on port 3333"
sudo systemctl start pi-chi-kiosk.service
sudo systemctl start pi-chi-cec.service
log "Kiosk started on HDMI output"

# ── 11. Print instructions ───────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pi-Chi Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):3333"
echo "  HDMI kiosk: Cage + Chromium on tty1"
echo "  Brain state: $STATE_DIR/brain-state.json"
echo ""
echo "  Next steps:"
echo "    1. Edit $REPO_DIR/.env.local"
echo "       Add your ANTHROPIC_API_KEY"
echo ""
echo "    2. Start the brain:"
echo "       sudo systemctl start pi-chi-brain"
echo ""
echo "    3. Watch brain logs:"
echo "       journalctl -u pi-chi-brain -f"
echo ""
echo "    4. Watch dashboard logs:"
echo "       journalctl -u pi-chi-dashboard -f"
echo ""
echo "    5. Watch kiosk logs:"
echo "       journalctl -u pi-chi-kiosk -f"
echo "       journalctl -u pi-chi-cec -f"
echo "       journalctl -u pi-chi-standby -f"
echo ""
echo "  Management:"
echo "    sudo systemctl stop pi-chi-brain     # Stop brain"
echo "    sudo systemctl restart pi-chi-brain   # Restart brain"
echo "    sudo systemctl status pi-chi-brain    # Check status"
echo "    sudo systemctl restart pi-chi-kiosk   # Restart HDMI kiosk"
echo "    sudo systemctl restart pi-chi-cec     # Restart CEC bridge"
echo "    sudo systemctl start pi-chi-standby   # Force lightweight standby screen"
echo ""
echo "═══════════════════════════════════════════════════════════"
