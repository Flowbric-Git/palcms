#!/usr/bin/env bash

#  PalCMS - installation sur un VPS Ubuntu 22.04 / 24.04
#
#    curl -fsSL https://github.com/Flowbric-Git/palcms/releases/latest/download/install.sh | sudo bash
#
#  Options (toutes facultatives, sinon les questions sont posées dans le terminal) :
#    --domain NOM | --ip IP      adresse du site
#    --path /cms                 chemin du site (défaut : /)
#    --https letsencrypt|selfsigned|none
#    --email EMAIL               email pour Let's Encrypt
#    --port 3000                 port interne du CMS
#    -y                          aucune question (valeurs par défaut)
#    --from-local ARCHIVE        installer depuis une archive locale (tests)
#    --repo PSEUDO/DEPOT         dépôt GitHub des releases

set -euo pipefail
export LC_ALL=C.UTF-8
export DEBIAN_FRONTEND=noninteractive

# Tout le script est dans un bloc { … } : avec "curl | bash", bash le lit en entier avant de l'exécuter,
# ainsi aucune commande ne peut "avaler" la suite du script en lisant l'entrée standard.
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
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

cat <<'BANNER'

   ____        _  ____ __  __ ____
  |  _ \ __ _ | |/ ___|  \/  / ___|
  | |_) / _` || | |   | |\/| \___ \
  |  __/ (_| || | |___| |  | |___) |
  |_|   \__,_||_|\____|_|  |_|____/   CMS pour serveur Palworld

BANNER

# Vérifications
step "Vérification du système"
[[ $EUID -eq 0 ]] || die "Ce script doit être lancé en root : ajoute « sudo » devant la commande."
[[ -f /etc/os-release ]] || die "Système non reconnu."
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu ]] || die "Seul Ubuntu est pris en charge (détecté : ${PRETTY_NAME:-inconnu})."
case "${VERSION_ID:-}" in 22.04 | 24.04) ;; *) die "Ubuntu 22.04 ou 24.04 requis (détecté : $VERSION_ID)." ;; esac
[[ $(uname -m) == x86_64 ]] || die "Le serveur dédié Palworld nécessite un processeur x86_64 (détecté : $(uname -m))."
command -v systemctl >/dev/null || die "systemd est requis."

mem_gb=$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo)
info "$PRETTY_NAME — ${mem_gb} Go de RAM — $(nproc) cœurs"
if awk "BEGIN {exit !($mem_gb < 7.5)}"; then
  warn "Moins de 8 Go de RAM : le serveur Palworld risque de manquer de mémoire (16 Go conseillés)."
fi
disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
(( disk_gb >= 15 )) || warn "Seulement ${disk_gb} Go libres : prévois au moins 15 Go pour le serveur Palworld."

# Paquets de base
step "Installation des paquets de base"
# Sur un VPS tout neuf, Ubuntu fait ses mises à jour automatiques au démarrage et bloque apt
# pendant quelques minutes : on attend au lieu d'échouer.
apt_busy() { fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; }
if apt_busy; then
  info "Ubuntu installe des mises à jour en arrière-plan, on attend qu'il ait fini..."
  for _ in $(seq 1 120); do apt_busy || break; sleep 5; done
  apt_busy && die "apt est toujours occupé après 10 minutes. Réessaie un peu plus tard."
fi
# Au cas où une mise à jour démarre pendant l'installation
apt-get() { command apt-get -o DPkg::Lock::Timeout=600 "$@"; }
apt-get update -qq
apt-get install -y -qq curl ca-certificates tar gnupg openssl sudo software-properties-common >/dev/null
info "OK"

# Utilisateur système
if ! id palcms >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin palcms
  info "Utilisateur système « palcms » créé"
fi
install -d -m 0750 -o palcms -g palcms "$DATA_DIR"

# Téléchargement
step "Téléchargement de PalCMS"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [[ -n $LOCAL_ARCHIVE ]]; then
  cp "$LOCAL_ARCHIVE" "$tmp/palcms.tar.gz"
  info "Archive locale : $LOCAL_ARCHIVE"
else
  if [[ $PALCMS_VERSION == latest ]]; then
    url="https://github.com/$PALCMS_REPO/releases/latest/download/palcms.tar.gz"
  else
    url="https://github.com/$PALCMS_REPO/releases/download/$PALCMS_VERSION/palcms.tar.gz"
  fi
  info "$url"
  curl -fL --retry 3 -o "$tmp/palcms.tar.gz" "$url" || die "Téléchargement impossible."
fi
tar -xzf "$tmp/palcms.tar.gz" -C "$tmp"
[[ -f $tmp/palcms/server/dist/index.js ]] || die "Archive invalide."

# Mise à jour : on remplace le code, jamais les données (/var/lib/palcms).
systemctl stop palcms 2>/dev/null || true
rm -rf "$INSTALL_DIR"
mv "$tmp/palcms" "$INSTALL_DIR"
chown -R root:root "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"
info "Installé dans $INSTALL_DIR (version $(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo '?'))"

install -m 0755 -o root -g root "$INSTALL_DIR/scripts/palcms-config" /usr/local/bin/palcms-config

# Questions
step "Adresse du site"
palcms-config ask "${CONFIG_ARGS[@]}"
# shellcheck disable=SC1091
source /etc/palcms/config.env

# Node.js, Nginx, pare-feu
step "Installation de Node.js $NODE_MAJOR, Nginx et du pare-feu"
node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [[ -z $node_major || $node_major -lt 20 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
info "Node.js $(node -v)"
apt-get install -y -qq nginx ufw >/dev/null
[[ $HTTPS_MODE == letsencrypt ]] && apt-get install -y -qq certbot >/dev/null
info "Nginx $(nginx -v 2>&1 | sed 's/.*\///')"

# Pare-feu : on autorise d'abord SSH (y compris sur un port personnalisé) pour ne jamais se couper l'accès.
for p in $(ss -tlnpH 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u); do ufw allow "$p/tcp" >/dev/null; done
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
[[ $HTTPS_MODE != none ]] && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
info "Pare-feu actif (SSH, HTTP$([[ $HTTPS_MODE != none ]] && echo ', HTTPS'))"

# Dépendances du CMS
step "Installation des dépendances du CMS"
(cd "$INSTALL_DIR/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
info "OK"

# palctl + sudoers
step "Droits système limités (palctl)"
install -d -m 0755 -o root -g root /usr/local/lib/palcms
install -m 0755 -o root -g root "$INSTALL_DIR/scripts/palctl" /usr/local/lib/palcms/palctl
cat >/etc/sudoers.d/palcms <<'EOF'
# PalCMS : le CMS peut uniquement lancer palctl, qui vérifie lui-même chaque commande.
palcms ALL=(root) NOPASSWD: /usr/local/lib/palcms/palctl
Defaults!/usr/local/lib/palcms/palctl !requiretty
EOF
chmod 0440 /etc/sudoers.d/palcms
visudo -cf /etc/sudoers.d/palcms >/dev/null || { rm -f /etc/sudoers.d/palcms; die "Règle sudoers invalide."; }
info "palctl installé, règle sudoers limitée à ce seul script"

# Service systemd
step "Service palcms"
cat >/etc/systemd/system/palcms.service <<EOF
[Unit]
Description=PalCMS (site et panel admin Palworld)
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
ExecStart=/usr/bin/node $INSTALL_DIR/server/dist/index.js
Restart=always
RestartSec=3
# Pas de sandbox systemd ici : elle serait héritée par palctl (lancé via sudo) et l'empêcherait d'installer le serveur.

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable palcms >/dev/null 2>&1
systemctl restart palcms

# Nginx + HTTPS
step "Nginx et certificat"
palcms-config apply

# Fin
scheme=https; [[ $HTTPS_MODE == none ]] && scheme=http
site_url="$scheme://$PUBLIC_HOST$BASE_PATH"
for _ in $(seq 1 30); do
  [[ -f $DATA_DIR/setup-token ]] && break
  sleep 1
done

echo
echo "${c_green}${c_bold}✔ PalCMS est installé !${c_off}"
echo
if [[ -f $DATA_DIR/setup-token ]]; then
  echo "  1. Ouvre ${c_bold}${site_url}setup${c_off}"
  echo "  2. Colle ce jeton d'installation : ${c_bold}${c_yellow}$(cat "$DATA_DIR/setup-token")${c_off}"
  echo "  3. Suis l'assistant : il installe le serveur Palworld puis le CMS."
else
  echo "  Site : ${c_bold}${site_url}${c_off}"
  echo "  (installation déjà terminée auparavant : tes données ont été conservées)"
fi
[[ $HTTPS_MODE == selfsigned ]] && echo "  ${c_yellow}Certificat auto-signé : ton navigateur affichera un avertissement, c'est normal.${c_off}"
echo
echo "  Commandes utiles :"
echo "    sudo palcms-config edit          changer l'adresse, le chemin ou le HTTPS"
echo "    sudo journalctl -u palcms -f     logs du CMS"
echo "    sudo journalctl -u palworld -f   logs du serveur Palworld"
echo "  Pense aussi à ouvrir le port de jeu (UDP) dans le pare-feu de ton hébergeur s'il en a un."
echo
exit 0
} </dev/null
