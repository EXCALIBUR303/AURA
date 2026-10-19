#!/bin/sh
# Verifies the gitignored runtime GLBs a build bundles: the licensed Astra
# original, the two unchanged Khronos furniture originals (pinned digests from
# frontend/public/world/FURNITURE_CREDITS.txt) and the two generated AURA kits
# (digests from their committed manifests). Nothing is downloaded or modified.
#   tools/check-assets.sh          report; exit 1 if anything is missing or differs
#   tools/check-assets.sh --warn   report only (always exit 0)
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORLD="$ROOT/frontend/public/world"
STATUS=0

digest() { shasum -a 256 "$1" | cut -d' ' -f1; }
manifest_digest() { sed -n 's/.*"sha256": *"\([0-9a-f]\{64\}\)".*/\1/p' "$1" | head -n 1; }

check() { # label, path, expected sha-256
  if [ ! -f "$2" ]; then
    echo "missing   $1 ($2)"; STATUS=1
  elif [ "$(digest "$2")" != "$3" ]; then
    echo "differs   $1 ($2)"; STATUS=1
  else
    echo "ok        $1"
  fi
}

check "Astra Lumen II (CC BY 4.0, unchanged)" \
  "$ROOT/assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb" \
  e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1
check "GlamVelvetSofa (CC BY 4.0, unchanged)" "$WORLD/GlamVelvetSofa.glb" \
  67202c74a1a33377771f162dc7fad612a6c9bd51ee15124c488e9851d9ac5266
check "SheenChair (CC0, unchanged)" "$WORLD/SheenChair.glb" \
  f0af2a2b102d28d540236306ae19f8fb36842df76bd38cf76f063f9bd2853399
check "AURA workstation kit (manifest)" "$WORLD/workstation.glb" "$(manifest_digest "$WORLD/workstation.manifest.json")"
check "AURA room kit (manifest)" "$WORLD/room-kit.glb" "$(manifest_digest "$WORLD/room-kit.manifest.json")"

if [ "$STATUS" -ne 0 ]; then
  echo "Copy the files per docs/ASSETS.md and frontend/asset-pipeline/README.md. A regenerated kit must be inspected and its manifest updated before it is accepted."
  [ "${1:-}" = "--warn" ] && exit 0
fi
exit "$STATUS"
