#!/usr/bin/env bash

#  PalCMS - install on an Ubuntu 22.04 / 24.04 VPS
#
#    curl -fsSL https://github.com/Flowbric-Git/palcms/releases/latest/download/install.sh | sudo bash
#
#  Options (all optional, otherwise the questions are asked in the terminal):
#    --domain NAME | --ip IP     site address
#    --path /cms                 site path (default: /)
#    --https letsencrypt|selfsigned|none
#    --email EMAIL               email for Let's Encrypt
#    --port 3000                 internal CMS port
#    -y                          no questions (default values)
#    --from-local ARCHIVE        install from a local archive (tests)
#    --repo USER/REPO            GitHub repository of the releases

set -euo pipefail
export LC_ALL=C.UTF-8
export DEBIAN_FRONTEND=noninteractive

# The whole script is inside a { … } block: with "curl | bash", bash reads all of it before running it,
# so no command can "swallow" the rest of the script by reading standard input.
{
PALCMS_REPO="${PALCMS_REPO:-Flowbric-Git/palcms}"
PALCMS_VERSION="${PALCMS_VERSION:-latest}"
INSTALL_DIR=/opt/palcms
DATA_DIR=/var/lib/palcms
NODE_MAJOR=24
LOCAL_ARCHIVE=""
CONFIG_ARGS=()

c_bold=$'\e[1m'; c_green=$'\e[32m'; c_yellow=$'\e[33m'; c_red=$'\e[31m'; c_cyan=$'\e[36m'; c_off=$'\e[0m'
step() { echo; echo "${c_cyan}${c_bold}▶ $*${c_off}"; }
info() { echo "${c_green}==>${c_off} $*"; }
warn() { echo "${c_yellow}⚠${c_off}  $*"; }
die() { echo "${c_red}✖${c_off}  $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-local) LOCAL_ARCHIVE="$(realpath "$2")"; shift 2 ;;
    --repo) PALCMS_REPO="$2"; shift 2 ;;
    --domain | --ip | --path | --https | --email | --port) CONFIG_ARGS+=("$1" "$2"); shift 2 ;;
    -y | --yes) CONFIG_ARGS+=("-y"); shift ;;
    -h | --help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

cat <<'BANNER'

   ____        _  ____ __  __ ____
  |  _ \ __ _ | |/ ___|  \/  / ___|
  | |_) / _` || | |   | |\/| \___ \
  |  __/ (_| || | |___| |  | |___) |
  |_|   \__,_||_|\____|_|  |_|____/   CMS for Palworld servers

BANNER

# Checks
step "Checking the system"
[[ $EUID -eq 0 ]] || die "This script must run as root: add \"sudo\" before the command."
[[ -f /etc/os-release ]] || die "Unknown system."
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu ]] || die "Only Ubuntu is supported (found: ${PRETTY_NAME:-unknown})."
case "${VERSION_ID:-}" in 22.04 | 24.04) ;; *) die "Ubuntu 22.04 or 24.04 required (found: $VERSION_ID)." ;; esac
[[ $(uname -m) == x86_64 ]] || die "The Palworld dedicated server needs an x86_64 CPU (found: $(uname -m))."
command -v systemctl >/dev/null || die "systemd is required."

mem_gb=$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo)
info "$PRETTY_NAME — ${mem_gb} GB of RAM — $(nproc) cores"
if awk "BEGIN {exit !($mem_gb < 7.5)}"; then
  warn "Less than 8 GB of RAM: the Palworld server may run out of memory (16 GB recommended)."
fi
disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
(( disk_gb >= 15 )) || warn "Only ${disk_gb} GB free: plan at least 15 GB for the Palworld server."

# Base packages
step "Installing base packages"
# On a brand new VPS, Ubuntu runs its automatic updates at boot and locks apt
# for a few minutes: wait instead of failing.
apt_busy() { fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; }
if apt_busy; then
  info "Ubuntu is installing updates in the background, waiting for it to finish..."
  for _ in $(seq 1 120); do apt_busy || break; sleep 5; done
  apt_busy && die "apt is still busy after 10 minutes. Try again a bit later."
fi
# In case an update starts during the install
apt-get() { command apt-get -o DPkg::Lock::Timeout=600 "$@"; }
apt-get update -qq
apt-get install -y -qq curl ca-certificates tar gnupg openssl sudo software-properties-common >/dev/null
info "OK"

# System user
if ! id palcms >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin palcms
  info "System user \"palcms\" created"
fi
install -d -m 0750 -o palcms -g palcms "$DATA_DIR"

# Download
step "Downloading PalCMS"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [[ -n $LOCAL_ARCHIVE ]]; then
  cp "$LOCAL_ARCHIVE" "$tmp/palcms.tar.gz"
  info "Local archive: $LOCAL_ARCHIVE"
else
  if [[ $PALCMS_VERSION == latest ]]; then
    url="https://github.com/$PALCMS_REPO/releases/latest/download/palcms.tar.gz"
  else
    url="https://github.com/$PALCMS_REPO/releases/download/$PALCMS_VERSION/palcms.tar.gz"
  fi
  info "$url"
  curl -fL --retry 3 -o "$tmp/palcms.tar.gz" "$url" || die "Download failed."
fi
tar -xzf "$tmp/palcms.tar.gz" -C "$tmp"
[[ -f $tmp/palcms/server/dist/index.js ]] || die "Invalid archive."

# Update: the code is replaced, never the data (/var/lib/palcms).
systemctl stop palcms 2>/dev/null || true
rm -rf "$INSTALL_DIR"
mv "$tmp/palcms" "$INSTALL_DIR"
chown -R root:root "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"
info "Installed in $INSTALL_DIR (version $(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo '?'))"

install -m 0755 -o root -g root "$INSTALL_DIR/scripts/palcms-config" /usr/local/bin/palcms-config

# Questions
step "Site address"
palcms-config ask "${CONFIG_ARGS[@]}"
# shellcheck disable=SC1091
source /etc/palcms/config.env

# Node.js, Nginx, firewall
step "Installing Node.js $NODE_MAJOR, Nginx and the firewall"
node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
# A hand-installed Node (e.g. /opt/node) may have npm next to it without npm being in the PATH.
find_npm() {
  local dir
  dir=$(dirname "$(readlink -f "$(command -v node)")" 2>/dev/null)
  if [[ -x $dir/npm ]]; then echo "$dir/npm"; else command -v npm || true; fi
}
if [[ -z $node_major || $node_major -lt 20 || -z $(find_npm) ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN=$(readlink -f "$(command -v node)")
NPM_BIN=$(find_npm)
info "Node.js $("$NODE_BIN" -v) ($NODE_BIN)"
apt-get install -y -qq nginx ufw >/dev/null
[[ $HTTPS_MODE == letsencrypt ]] && apt-get install -y -qq certbot >/dev/null
info "Nginx $(nginx -v 2>&1 | sed 's/.*\///')"

# Firewall: allow SSH first (including on a custom port) so access is never cut off.
for p in $(ss -tlnpH 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u); do ufw allow "$p/tcp" >/dev/null; done
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
[[ $HTTPS_MODE != none ]] && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
info "Firewall on (SSH, HTTP$([[ $HTTPS_MODE != none ]] && echo ', HTTPS'))"

# CMS dependencies
step "Installing the CMS dependencies"
(cd "$INSTALL_DIR/server" && PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" ci --omit=dev --no-audit --no-fund --loglevel=error)
info "OK"

# palctl + sudoers
step "Limited system rights (palctl)"
install -d -m 0755 -o root -g root /usr/local/lib/palcms
install -m 0755 -o root -g root "$INSTALL_DIR/scripts/palctl" /usr/local/lib/palcms/palctl
cat >/etc/sudoers.d/palcms <<'EOF'
# PalCMS: the CMS may only run palctl, which checks every command itself.
palcms ALL=(root) NOPASSWD: /usr/local/lib/palcms/palctl
Defaults!/usr/local/lib/palcms/palctl !requiretty
EOF
chmod 0440 /etc/sudoers.d/palcms
visudo -cf /etc/sudoers.d/palcms >/dev/null || { rm -f /etc/sudoers.d/palcms; die "Invalid sudoers rule."; }
info "palctl installed, sudoers rule limited to this single script"

# systemd service
step "palcms service"
cat >/etc/systemd/system/palcms.service <<EOF
[Unit]
Description=PalCMS (Palworld website and admin panel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=palcms
Group=palcms
WorkingDirectory=$INSTALL_DIR/server
EnvironmentFile=/etc/palcms/config.env
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=DATA_DIR=$DATA_DIR
Environment=WEB_DIST=$INSTALL_DIR/web/dist
Environment=PALCMS_VERSION=$(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo 0.0.0)
Environment="PALCTL=sudo -n /usr/local/lib/palcms/palctl"
ExecStart=$NODE_BIN $INSTALL_DIR/server/dist/index.js
Restart=always
RestartSec=3
# No systemd sandbox here: palctl (run through sudo) would inherit it and could not install the server.

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable palcms >/dev/null 2>&1
systemctl restart palcms

# Nginx + HTTPS
step "Nginx and certificate"
palcms-config apply

# Done
scheme=https; [[ $HTTPS_MODE == none ]] && scheme=http
site_url="$scheme://$PUBLIC_HOST$BASE_PATH"
for _ in $(seq 1 30); do
  [[ -f $DATA_DIR/setup-token ]] && break
  sleep 1
done

echo
echo "${c_green}${c_bold}✔ PalCMS is installed!${c_off}"
echo
if [[ -f $DATA_DIR/setup-token ]]; then
  echo "  1. Open ${c_bold}${site_url}setup${c_off}"
  echo "  2. Paste this setup token: ${c_bold}${c_yellow}$(cat "$DATA_DIR/setup-token")${c_off}"
  echo "  3. Follow the wizard: it installs the Palworld server, then the CMS (English or French)."
else
  echo "  Site: ${c_bold}${site_url}${c_off}"
  echo "  (setup already finished before: your data was kept)"
fi
[[ $HTTPS_MODE == selfsigned ]] && echo "  ${c_yellow}Self-signed certificate: your browser will show a warning, that is expected.${c_off}"
echo
echo "  Useful commands:"
echo "    sudo palcms-config edit          change the address, the path or HTTPS"
echo "    sudo journalctl -u palcms -f     CMS logs"
echo "    sudo journalctl -u palworld -f   Palworld server logs"
echo "  Also remember to open the game port (UDP) in your host's firewall if it has one."
echo
exit 0
} </dev/null
