#!/bin/sh
# Builds the frontend, then the signed-to-run-locally AURA.app.
#   tools/build-app.sh            Release (bundled frontend, production mode)
#   tools/build-app.sh Debug      Debug (Xcode's Run uses the dev server; see the AURA scheme)
# Output: macos/.build/xcode/Build/Products/<Configuration>/AURA.app
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONFIGURATION=${1:-Release}
DERIVED="$ROOT/macos/.build/xcode"

npm --prefix "$ROOT/frontend" run build
xcodebuild -quiet -project "$ROOT/macos/AURA.xcodeproj" -scheme AURA \
  -configuration "$CONFIGURATION" -destination "generic/platform=macOS" -derivedDataPath "$DERIVED" build
echo "Built $DERIVED/Build/Products/$CONFIGURATION/AURA.app"
