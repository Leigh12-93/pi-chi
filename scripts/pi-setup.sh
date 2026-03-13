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
sudo apt-get install -y -qq git python3 build-essential

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

# ── 10. Enable and start services ────────────────────────────────

sudo systemctl daemon-reload
sudo systemctl enable pi-chi-dashboard.service
sudo systemctl enable pi-chi-brain.service

# Start dashboard immediately
sudo systemctl start pi-chi-dashboard.service
log "Dashboard started on port 3333"

# ── 11. Print instructions ───────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pi-Chi Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):3333"
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
echo "  Management:"
echo "    sudo systemctl stop pi-chi-brain     # Stop brain"
echo "    sudo systemctl restart pi-chi-brain   # Restart brain"
echo "    sudo systemctl status pi-chi-brain    # Check status"
echo ""
echo "═══════════════════════════════════════════════════════════"
