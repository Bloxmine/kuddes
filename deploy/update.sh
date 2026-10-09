#!/usr/bin/env bash
# Puts a new version live: fetch it, install, build, migrate, restart.
# Run as root on the server: bash /opt/kuddes/deploy/update.sh
set -euo pipefail

cd /opt/kuddes
sudo -u kuddes git pull --ff-only
sudo -u kuddes npm ci
sudo -u kuddes npm run build
sudo -u kuddes npm run db:migrate
systemctl restart kuddes
sleep 3
curl -fsS http://127.0.0.1:8787/api/health && echo " Kuddes draait weer."
# BuddyPoke (web/) isn't in git, so a pull never brings it: it's copied over by hand (DEPLOY.md 5.3)
if ! sudo -u kuddes test -r /opt/kuddes/web/gadget.html; then
  echo "LET OP: BuddyPoke ontbreekt (/opt/kuddes/web/gadget.html niet gevonden of niet leesbaar). Kopieer web/ zoals in DEPLOY.md stap 5.3."
fi
