#!/usr/bin/env bash
# Dynamic command guard shim.
# Installed under /opt/install-guard/bin/<name> (that dir is prepended to PATH), so
# this wins over the real binary. It derives the guarded command from its own name
# (argv0), asks cmd-guard.js for a verdict, and either blocks, rewrites, or transparently
# execs the real binary. Rules: injected /opt/install-guard/rules.json, else the baked
# default inside cmd-guard.js.

GUARD=/app/frontend/scripts/cmd-guard.js
BIN_NAME=$(basename "$0")

if [ -f "$GUARD" ] && command -v node >/dev/null 2>&1; then
  OUT=$(node "$GUARD" --cmd "$BIN_NAME" --args "$@")
  RC=$?
  if [ "$RC" -eq 1 ]; then
    exit 1
  elif [ "$RC" -eq 2 ]; then
    # Rewrite: OUT holds the replacement argv, one token per line.
    NEWARGV=()
    while IFS= read -r line; do
      [ -n "$line" ] && NEWARGV+=("$line")
    done <<EOF
$OUT
EOF
    exec "${NEWARGV[@]}"
  fi
fi

# Allow: find the next binary with our name in PATH (skipping our own directory) and exec it.
SELF_DIR=$(dirname "$(readlink -f "$0")")

REAL_BIN=""
IFS=':' read -ra DIRS <<<"$PATH"
for dir in "${DIRS[@]}"; do
  if [ "$dir" != "$SELF_DIR" ] && [ -x "$dir/$BIN_NAME" ]; then
    REAL_BIN="$dir/$BIN_NAME"
    break
  fi
done

if [ -z "$REAL_BIN" ]; then
  echo "cmd-guard: real $BIN_NAME not found in PATH" >&2
  exit 1
fi

exec "$REAL_BIN" "$@"
