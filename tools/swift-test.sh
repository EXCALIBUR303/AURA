#!/bin/sh
# Runs the native test suite. With Command Line Tools only, `swift test`
# intermittently fails with "plugin for module 'TestingMacros' not found"
# (observed ~50% of runs on CLT/Swift 6.4, 2026-10-16); passing the plugin
# path explicitly makes it deterministic. With full Xcode the directory below
# does not exist and this falls back to plain `swift test`.
set -e
cd "$(dirname "$0")/../macos"
PLUGINS="$(xcode-select -p)/usr/lib/swift/host/plugins/testing"
if [ -d "$PLUGINS" ]; then
  exec swift test -Xswiftc -plugin-path -Xswiftc "$PLUGINS" "$@"
else
  exec swift test "$@"
fi
