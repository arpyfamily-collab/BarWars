#!/usr/bin/env bash
# Generate command-guard shims from the ACTIVE ruleset (injected rules.json, or the
# baked default inside cmd-guard.js). The set of guarded binaries is therefore
# data-driven -- add a `commands.<name>` entry to the rules and the next run creates its
# shim. Nothing here (or in the Dockerfile) hardcodes which binaries are guarded.
#
# Run it:
#   - at image build  -> creates shims for the baked default (the floor: yarn)
#   - at pod provisioning, right AFTER cortex writes /opt/install-guard/rules.json
#     -> creates shims for the live dashboard set (yarn, eas, npx, ...) with NO rebuild
set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
GUARD="$SCRIPT_DIR/cmd-guard.js"
SHIM_SRC="$SCRIPT_DIR/install-guard.sh"
BIN_DIR=/opt/install-guard/bin
MASTER="$BIN_DIR/.install-guard.sh"

mkdir -p "$BIN_DIR"
install -m 0755 "$SHIM_SRC" "$MASTER"

# Drop shims we created previously (symlinks to our master) so commands removed from the
# rules stop being guarded. Leaves any unrelated files in the dir untouched.
for f in "$BIN_DIR"/*; do
  if [ -L "$f" ] && [ "$(readlink "$f")" = "$MASTER" ]; then
    rm -f "$f"
  fi
done

# One shim per guarded command. Each is a symlink to the master; the shim reads its own
# name (argv0) to know which command it is.
for name in $(node "$GUARD" --list-commands); do
  ln -sf "$MASTER" "$BIN_DIR/$name"
done
